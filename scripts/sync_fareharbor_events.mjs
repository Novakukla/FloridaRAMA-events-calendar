import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SHOULD_WRITE = process.argv.includes("--write");
const MERGE_EXISTING = process.argv.includes("--merge-existing") || process.env.MERGE_EXISTING === "1";
const ALLOW_EMPTY_WRITE = process.argv.includes("--allow-empty") || process.env.ALLOW_EMPTY === "1";

const COMPANY = process.env.FAREHARBOR_COMPANY || "floridarama";
const FLOW = process.env.FAREHARBOR_FLOW || "1438415";
const TIME_ZONE = process.env.FAREHARBOR_TZ || "America/New_York";
const REQUEST_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function getArgValue(flag) {
	const i = process.argv.indexOf(flag);
	if (i === -1) return null;
	const v = process.argv[i + 1];
	if (!v || v.startsWith("--")) return null;
	return v;
}

const DEFAULT_EVENTS_FILE = fileURLToPath(
	new URL("../events.json", import.meta.url)
);
const EVENTS_FILE = getArgValue("--events-file") || process.env.EVENTS_FILE || DEFAULT_EVENTS_FILE;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(str) {
	return String(str)
		.replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
			try {
				return String.fromCodePoint(parseInt(hex, 16));
			} catch {
				return _;
			}
		})
		.replaceAll(/&#([0-9]+);/g, (_, dec) => {
			try {
				return String.fromCodePoint(parseInt(dec, 10));
			} catch {
				return _;
			}
		})
		.replaceAll(/&amp;/g, "&")
		.replaceAll(/&lt;/g, "<")
		.replaceAll(/&gt;/g, ">")
		.replaceAll(/&quot;/g, '"')
		.replaceAll(/&#39;/g, "'")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function extractMetaContent(html, attrName, attrValue) {
	const re = new RegExp(
		`<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["'][^>]*>`,
		"i"
	);
	const m = html.match(re);
	return m ? decodeHtmlEntities(m[1]) : null;
}

function extractAttr(tag, attrName) {
	const re = new RegExp(`${attrName}\\s*=\\s*(["'])(.*?)\\1`, "i");
	const m = String(tag || "").match(re);
	return m ? decodeHtmlEntities(m[2]) : "";
}

function isGenericFareharborThumb(u) {
	const s = String(u || "");
	return /marketing\.fareharbor\.com\/wp-content\/uploads\//i.test(s) || /fh-og/i.test(s);
}

function isNonEventImageUrl(u) {
	const s = String(u || "");
	if (!s || /^data:/i.test(s)) return true;
	if (isGenericFareharborThumb(s)) return true;
	if (/google-reviews-stars|base64/i.test(s)) return true;
	return false;
}

function isBookingFlowTile({ url, alt = "", className = "", title = "" }) {
	const text = `${alt} ${className}`.toLowerCase();
	if (/receipt-logo|company-print-logo/.test(text)) return true;
	if (!/flow-node-tile|page tile|item tile/.test(text)) return false;

	const titleText = String(title || "").trim().toLowerCase();
	return !titleText || !String(alt || "").toLowerCase().includes(titleText);
}

function extractTitleFromHtml(html) {
	// Try h1 first, then og:title, then title.
	const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
	if (h1) return decodeHtmlEntities(h1[1].replaceAll(/<[^>]+>/g, " "));

	const og = extractMetaContent(html, "property", "og:title") || extractMetaContent(html, "name", "og:title");
	if (og) return og;

	const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (t) return decodeHtmlEntities(t[1]);

	return null;
}

function extractDescriptionFromHtml(html) {
	// "Activity details" section is rendered client-side on FareHarbor,
	// so this static HTML fallback tries to find it in the raw HTML.
	// Look for heading text "Activity details" and grab the next paragraph.
	const m = html.match(/Activity\s+details<\/[^>]+>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
	if (m) {
		const text = decodeHtmlEntities(m[1].replaceAll(/<[^>]+>/g, " "));
		if (text.length > 20) return text;
	}
	return null;
}

function extractDescriptionFromText(text) {
	const lines = String(text || "")
		.replaceAll(/\u00A0/g, " ")
		.split(/\r?\n+/)
		.map((line) => line.replaceAll(/\s+/g, " ").trim())
		.filter(Boolean);
	if (!lines.length) return null;

	const startIndex = lines.findIndex((line) => /^details$/i.test(line));
	if (startIndex === -1) return null;

	const stopRe =
		/^(additional information|cancellations|all prices are|powered by|see any illegal content|overview|duration|meeting point|select date|prices for)\b/i;
	const picked = [];
	for (const line of lines.slice(startIndex + 1)) {
		if (stopRe.test(line)) break;
		if (/^(details|view|buy|close)$/i.test(line)) continue;
		picked.push(line);
	}

	const description = picked.join("\n").trim();
	return description.length > 20 ? description : null;
}

function extractBestImageFromHtml(html, pageUrl) {
	const title = extractTitleFromHtml(html) || "";

	// JSON-LD usually has the real image.
	for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
		const txt = (m[1] || "").trim();
		if (!txt) continue;
		try {
			const data = JSON.parse(txt);
			const objs = Array.isArray(data) ? data : [data];
			for (const o of objs) {
				if (!o || typeof o !== "object") continue;
				const img = o.image || o.thumbnailUrl;
				const pick = Array.isArray(img) ? img.find((x) => typeof x === "string") : img;
				if (!pick) continue;
				try {
					const abs = new URL(pick, pageUrl).toString();
					if (!isNonEventImageUrl(abs)) return abs;
				} catch {
					// skip bad URL
				}
			}
		} catch {
			// skip bad JSON-LD
		}
	}

	const og =
		extractMetaContent(html, "property", "og:image") ||
		extractMetaContent(html, "name", "og:image") ||
		extractMetaContent(html, "property", "twitter:image") ||
		extractMetaContent(html, "name", "twitter:image");

	// Use og/twitter if it's not the generic icon.
	if (og && !isNonEventImageUrl(og)) {
		try {
			return new URL(og, pageUrl).toString();
		} catch {
			// skip bad URL
		}
	}

	// Try common image patterns in page HTML.
	const candidates = [];

	for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = m[0];
		const src = extractAttr(tag, "src");
		if (!src) continue;
		candidates.push({
			url: src,
			alt: extractAttr(tag, "alt"),
			className: extractAttr(tag, "class"),
		});
	}
	for (const m of html.matchAll(/background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
		candidates.push({ url: m[1] });
	}
	for (const m of html.matchAll(/url\(\s*['"]?([^'")]+\.(?:png|jpe?g|webp))['"]?\s*\)/gi)) {
		candidates.push({ url: m[1] });
	}

	for (const c of candidates) {
		if (!c?.url) continue;
		if (isNonEventImageUrl(c.url)) continue;
		if (isBookingFlowTile({ ...c, title })) continue;
		try {
			const abs = new URL(c.url, pageUrl).toString();
			return abs;
		} catch {
			// skip bad URL
		}
	}

	// Last fallback: generic og image.
	if (!og) return null;
	try {
		return new URL(og, pageUrl).toString();
	} catch {
		return null;
	}
}

function todayYmdInTimeZone(timeZone) {
	// en-CA gives YYYY-MM-DD format
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function parsePricesForAnchor(html) {
	return parsePricesForAnchors(html)[0] || null;
}

function parsePricesForAnchors(html) {
	// Looks like: Prices for <a ...>Saturday, January 31, 2026</a>
	const entries = [];
	const re = /Prices\s+for\s*<a[^>]+href=["']([^"']*\/availability\/\d+\/book\/[^"']*)["'][^>]*>([^<]+)<\/a>/gi;
	for (const m of html.matchAll(re)) {
		entries.push({
			availabilityUrl: m[1],
			dateLabel: decodeHtmlEntities(m[2]),
		});
	}
	return entries;
}

function parseDateLabelToYmd(dateLabel) {
	// Expects "Saturday, January 31, 2026" (weekday optional)
	const text = String(dateLabel).trim();
	const m = text.match(/(?:\w+\s*,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
	if (!m) return null;
	const [, monthName, dayStr, yearStr] = m;

	const monthIndex = [
		"january",
		"february",
		"march",
		"april",
		"may",
		"june",
		"july",
		"august",
		"september",
		"october",
		"november",
		"december",
	].indexOf(monthName.toLowerCase());
	if (monthIndex === -1) return null;

	const year = Number(yearStr);
	const day = Number(dayStr);
	const month = monthIndex + 1;

	const y = String(year).padStart(4, "0");
	const mo = String(month).padStart(2, "0");
	const d = String(day).padStart(2, "0");
	return `${y}-${mo}-${d}`;
}

function parseDateLabelToTime(dateLabel) {
	const text = String(dateLabel || "").replaceAll(/\u00A0/g, " ");
	const m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?|AM|PM)\b/i);
	if (!m) return null;
	return {
		h: Number(m[1]),
		m: Number(m[2] || "0"),
		ap: normalizeAmPm(m[3]),
	};
}

function normalizeAmPm(ap) {
	if (!ap) return null;
	const s = String(ap).toUpperCase().replaceAll(".", "");
	if (s === "AM" || s === "PM") return s;
	return null;
}

function parseEventTimeRange(html) {
	const text = String(html || "")
		.replaceAll(/\u00A0/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (!text) return null;

	// Match ranges such as "Event is 10AM - 12PM" and "From 6-8 PM".
	const rangeRe =
		/(?:\b(?:Event\s+is|From|Hours|Time|When|Schedule)\b[^\d]{0,20})?(\d{1,2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?|AM|PM)?\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?|AM|PM)\b/i;
	const m = text.match(rangeRe);
	if (!m) return null;
	const [, sh, sm, sapRaw, eh, em, eapRaw] = m;
	let sap = normalizeAmPm(sapRaw);
	let eap = normalizeAmPm(eapRaw);

	// If one side is missing AM/PM, borrow it.
	if (!sap && eap) sap = eap;
	if (!eap && sap) eap = sap;

	// If both are missing AM/PM, too fuzzy.
	if (!sap || !eap) return null;

	return {
		start: { h: Number(sh), m: Number(sm || "0"), ap: sap },
		end: { h: Number(eh), m: Number(em || "0"), ap: eap },
	};
}

function parseDurationMinutes(text) {
	const t = String(text || "")
		.replaceAll(/\u00A0/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (!t) return 0;

	let durationMinutes = 0;
	const hoursM = t.match(/\b(\d+(?:\.\d+)?)\s*Hours?\b/i);
	if (hoursM) durationMinutes += Math.round(Number(hoursM[1]) * 60);
	const minsM = t.match(/\b(\d{1,3})\s*Minutes?\b/i);
	if (minsM) durationMinutes += Number(minsM[1]);

	return Number.isFinite(durationMinutes) ? durationMinutes : 0;
}

function parseStartTimeAndDuration(text) {
	const t = String(text || "")
		.replaceAll(/\u00A0/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (!t) return null;

	// Example: "6:00 PM" + "2 Hours"
	const startM = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?|AM|PM)\b/i);
	if (!startM) return null;
	const sh = Number(startM[1]);
	const sm = Number(startM[2] || "0");
	const sap = normalizeAmPm(startM[3]);
	if (!sap) return null;

	const durationMinutes = parseDurationMinutes(t);
	if (!durationMinutes || !Number.isFinite(durationMinutes)) return null;

	const start24 = to24Hour({ h: sh, m: sm, ap: sap });
	const startTotal = start24.hour * 60 + start24.minute;
	const endTotal = (startTotal + durationMinutes) % (24 * 60);
	const endHour24 = Math.floor(endTotal / 60);
	const endMinute = endTotal % 60;
	const endAp = endHour24 >= 12 ? "PM" : "AM";
	const endHour12 = ((endHour24 + 11) % 12) + 1;

	return {
		start: { h: sh, m: sm, ap: sap },
		end: { h: endHour12, m: endMinute, ap: endAp },
	};
}

function timeRangeFromStartAndMinutes(start, minutes) {
	const start24 = to24Hour(start);
	const startTotal = start24.hour * 60 + start24.minute;
	const endTotal = (startTotal + minutes) % (24 * 60);
	const endHour24 = Math.floor(endTotal / 60);
	const endMinute = endTotal % 60;
	const endAp = endHour24 >= 12 ? "PM" : "AM";
	const endHour12 = ((endHour24 + 11) % 12) + 1;

	return {
		start,
		end: { h: endHour12, m: endMinute, ap: endAp },
	};
}

function to24Hour({ h, m, ap }) {
	let hour = h % 12;
	if (ap === "PM") hour += 12;
	return { hour, minute: m };
}

function ymdAndTimeToIsoLocal(ymd, hour, minute) {
	const hh = String(hour).padStart(2, "0");
	const mm = String(minute).padStart(2, "0");
	return `${ymd}T${hh}:${mm}:00`;
}

async function fetchHtml(url) {
	const res = await fetch(url, {
		redirect: "follow",
		headers: {
			"user-agent": REQUEST_USER_AGENT,
			accept: "text/html,application/xhtml+xml",
		},
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return await res.text();
}

function isNaiveLocalIso(value) {
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(value || ""));
}

function availabilityIdFromFareharborUrl(url) {
	const m = String(url || "").match(/\/availability\/(\d+)\b/i);
	return m ? m[1] : null;
}

async function fetchFareharborAvailabilityTimes(availabilityUrl) {
	const itemId = itemIdFromFareharborUrl(availabilityUrl);
	const availabilityId = availabilityIdFromFareharborUrl(availabilityUrl);
	if (!itemId || !availabilityId) return null;

	const apiUrl = `https://fareharbor.com/api/v1/companies/${encodeURIComponent(COMPANY)}/items/${encodeURIComponent(itemId)}/availabilities/${encodeURIComponent(availabilityId)}/`;
	try {
		const res = await fetch(apiUrl, {
			redirect: "follow",
			headers: {
				"user-agent": REQUEST_USER_AGENT,
				accept: "application/json",
			},
		});
		if (!res.ok) return null;

		const json = await res.json();
		const startAt = json?.availability?.start_at || json?.start_at;
		const endAt = json?.availability?.end_at || json?.end_at;
		if (!isNaiveLocalIso(startAt) || !isNaiveLocalIso(endAt)) return null;

		return { startAt, endAt };
	} catch {
		return null;
	}
}

async function withPlaywright(fn) {
	let pw;
	try {
		pw = await import("playwright");
	} catch (err) {
		throw new Error(
			"Playwright is not installed. Run `npm install` at repo root."
		);
	}

	const browser = await pw.chromium.launch({
		headless: true,
		args: ["--disable-blink-features=AutomationControlled"],
	});
	const context = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		viewport: { width: 1280, height: 800 },
	});
	try {
		return await fn({ browser, context });
	} finally {
		await context.close().catch(() => {});
		await browser.close().catch(() => {});
	}
}

async function getItemUrlsFromListing(listingUrl) {
	// Try plain HTML first.
	const listingHtml = await fetchHtml(listingUrl);
	let itemUrls = extractItemUrlsFromItemsListing(listingHtml)
		.map(normalizeFareharborUrl)
		.filter((u) => u.includes(`/embeds/book/${COMPANY}/items/`));

	// If static HTML has item URLs, use those.
	if (itemUrls.length > 0) {
		return { itemUrls: [...new Set(itemUrls)], usedBrowser: false };
	}

	// If not, use headless browser render.
	return await withPlaywright(async ({ context }) => {
		const page = await context.newPage();
		try {
			await page.goto(listingUrl, { waitUntil: "domcontentloaded" });
			await page.waitForTimeout(1500);
			await page.waitForLoadState("networkidle").catch(() => {});

			const abs = await page.evaluate((company) => {
				const hrefs = Array.from(document.querySelectorAll('a[href*="/items/"]'))
					.map((a) => a.getAttribute("href"))
					.filter(Boolean);

				const out = [];
				for (const h of hrefs) {
					try {
						const u = new URL(h, "https://fareharbor.com");
						if (!u.pathname.includes(`/embeds/book/${company}/items/`)) continue;
						if (!/\/items\/\d+\/?/i.test(u.pathname)) continue;
						out.push(u.toString());
					} catch {
						// skip bad link
					}
				}
				return out;
			}, COMPANY);

			itemUrls = [...new Set(abs)];

			if (itemUrls.length === 0) {
				const itemButtons = page.getByRole("button", { name: /^Experience:/ });
				const buttonCount = await itemButtons.count();
				for (let i = 0; i < buttonCount; i++) {
					await page.goto(listingUrl, { waitUntil: "domcontentloaded" });
					await page.waitForLoadState("networkidle").catch(() => {});

					const button = page.getByRole("button", { name: /^Experience:/ }).nth(i);
					try {
						await Promise.all([
							page.waitForURL(/\/embeds\/book\/[^/]+\/items\/\d+\//i, { timeout: 10_000 }),
							button.click(),
						]);

						const resolved = normalizeFareharborUrl(page.url());
						if (resolved.includes(`/embeds/book/${COMPANY}/items/`)) {
							itemUrls.push(resolved);
						}
					} catch {
						// skip buttons that don't navigate to an item page
					}
				}

				itemUrls = [...new Set(itemUrls)];
			}

			if (itemUrls.length === 0) {
				const currentUrl = page.url();
				const snippet = (await page.content().catch(() => "")).slice(0, 500);
				console.warn(`  Browser render returned 0 items. Rendered URL: ${currentUrl}`);
				console.warn(`  Page content snippet: ${snippet}`);
			}

			return { itemUrls, usedBrowser: true };
		} finally {
			await page.close().catch(() => {});
		}
	});
}

async function scrapeItemViaPlaywright(context, itemUrl) {
	const page = await context.newPage();
	try {
		const itemId = itemIdFromFareharborUrl(itemUrl);
		const collectAvailabilityEntries = async () => {
			const entries = await page
				.locator('a[href*="/availability/"]')
				.evaluateAll((nodes) =>
					nodes
						.map((node) => ({
							availabilityUrl: node.getAttribute("href") || "",
							dateLabel: (node.textContent || "").trim(),
						}))
						.filter((entry) => /\/availability\/\d+\/book\//i.test(entry.availabilityUrl))
						.filter((entry) => /\d{4}/.test(entry.dateLabel))
				);

			const unique = new Map();
			for (const entry of entries) {
				const key = `${entry.availabilityUrl}::${entry.dateLabel}`;
				if (!unique.has(key)) unique.set(key, entry);
			}
			return [...unique.values()];
		};

		await page.goto(itemUrl, { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
		await page.waitForLoadState("networkidle").catch(() => {});

		// Wait until template placeholders resolve.
		await page
			.waitForFunction(() => {
				const h1 = document.querySelector("h1");
				const t = (h1?.textContent || "").trim();
				return t && !/\[!\s*item\.name\s*!\]/i.test(t);
			}, { timeout: 10_000 })
			.catch(() => {});

		let availabilityEntries = await collectAvailabilityEntries();
		if (availabilityEntries.length === 0 && itemId) {
			const now = new Date();
			const seen = new Map();
			for (let offset = 0; offset < 6; offset++) {
				const monthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
				const year = String(monthDate.getFullYear());
				const month = String(monthDate.getMonth() + 1).padStart(2, "0");
				const calendarUrl = `https://fareharbor.com/embeds/book/${COMPANY}/items/${itemId}/calendar/${year}/${month}/?full-items=yes&flow=${encodeURIComponent(FLOW)}`;

				await page.goto(calendarUrl, { waitUntil: "domcontentloaded" });
				await page.waitForLoadState("networkidle").catch(() => {});

				for (const entry of await collectAvailabilityEntries()) {
					const key = `${entry.availabilityUrl}::${entry.dateLabel}`;
					if (!seen.has(key)) seen.set(key, entry);
				}
			}
			availabilityEntries = [...seen.values()];
		}

		const dom = await page.evaluate(() => {
			const h1 = document.querySelector("h1");
			const title = (h1?.textContent || document.title || "").trim();
			const titleLower = title.toLowerCase();

			const meta = (name, value) => {
				const sel = `meta[${name}="${value}"]`;
				return document.querySelector(sel)?.getAttribute("content") || null;
			};

			const isGenericFareharborThumb = (u) => {
				const s = String(u || "");
				return (
					!s ||
					s.startsWith("data:") ||
					s.includes("marketing.fareharbor.com/wp-content/uploads/") ||
					s.includes("fh-og") ||
					s.includes("google-reviews-stars") ||
					s.includes("base64")
				);
			};

			const isBookingFlowTile = (text) => {
				const t = String(text || "").toLowerCase();
				if (/receipt-logo|company-print-logo/.test(t)) return true;
				if (!/flow-node-tile|page tile|item tile/.test(t)) return false;
				return !titleLower || !t.includes(titleLower);
			};

			const normalizeUrl = (u) => {
				if (!u) return null;
				try {
					return new URL(u, window.location.href).toString();
				} catch {
					return null;
				}
			};

			const metaThumb =
				meta("property", "og:image") ||
				meta("name", "og:image") ||
				meta("name", "twitter:image") ||
				meta("property", "twitter:image");

			// JSON-LD first.
			let jsonLdThumb = null;
			for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 8)) {
				const txt = (s.textContent || "").trim();
				if (!txt) continue;
				try {
					const data = JSON.parse(txt);
					const objs = Array.isArray(data) ? data : [data];
					for (const o of objs) {
						if (!o || typeof o !== "object") continue;
						const img = o.image || o.thumbnailUrl;
						const pick = Array.isArray(img) ? img.find((x) => typeof x === "string") : img;
						const norm = normalizeUrl(pick);
						if (norm && !isGenericFareharborThumb(norm)) {
							jsonLdThumb = norm;
							break;
						}
					}
					if (jsonLdThumb) break;
				} catch {
					// skip bad JSON-LD
				}
				if (jsonLdThumb) break;
			}

			// Try to find a better real-page thumbnail.
			const candidates = [];
			if (jsonLdThumb) candidates.push({ url: jsonLdThumb, score: 10_000_000 });
			if (metaThumb) candidates.push({ url: normalizeUrl(metaThumb), score: 10 });

			const imgEls = Array.from(document.querySelectorAll("img")).slice(0, 80);
			for (const img of imgEls) {
				const src = normalizeUrl(img.currentSrc || img.src || img.getAttribute("src"));
				if (!src) continue;
				const label = `${img.alt || ""} ${img.className || ""} ${img.parentElement?.className || ""}`;
				if (isBookingFlowTile(label)) continue;
				const nw = Number(img.naturalWidth || 0);
				const nh = Number(img.naturalHeight || 0);
				const rect = img.getBoundingClientRect();
				const renderedArea = Math.max(0, rect.width) * Math.max(0, rect.height);
				const naturalArea = nw && nh ? nw * nh : 0;
				const area = renderedArea || Math.min(naturalArea, 20_000);
				const inHero = Boolean(img.closest(".fh-item__image,.item-image,.hero,.gallery,.carousel,.slider"));
				candidates.push({ url: src, score: (area || 1) + (inHero ? 5_000_000 : 0) });
			}

			// Also check background images.
			const bgEls = Array.from(
				document.querySelectorAll('button,[style*="background"],.fh-item__image,.item-image,.hero,.gallery,.gallery-slides,.gallery-slides *,[aria-label*="photo" i],.carousel,.slider')
			).slice(0, 120);
			for (const el of bgEls) {
				const cs = window.getComputedStyle(el);
				const bg = cs.backgroundImage || "";
				if (!bg || bg === "none") continue;
				const m = bg.match(/url\(\s*['\"]?([^'\")]+)['\"]?\s*\)/i);
				if (!m) continue;
				const src = normalizeUrl(m[1]);
				if (!src) continue;
				if (isGenericFareharborThumb(src)) continue;
				const r = el.getBoundingClientRect();
				const area = Math.max(0, r.width) * Math.max(0, r.height);
				const inGallery = Boolean(el.closest(".gallery-slides,[aria-label='Slideshow Photos']"));
				const inHero = el.matches(".fh-item__image,.item-image,.hero") || Boolean(el.closest(".fh-item__image,.item-image,.hero"));
				candidates.push({ url: src, score: (area || 1) + (inGallery ? 7_000_000 : 0) + (inHero ? 5_000_000 : 0) });
			}

			const best = candidates
				.filter((c) => c.url)
				.filter((c) => !isGenericFareharborThumb(c.url))
				.sort((a, b) => b.score - a.score)[0];

			const thumbnail = best?.url || normalizeUrl(metaThumb);

			// Extract description from "Activity details" section.
			let description = null;
			const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], [class*="section"]'));
			for (const heading of headings) {
				const text = (heading.textContent || "").trim();
				if (/^activity\s+details$/i.test(text)) {
					// Walk through next siblings / child elements to find the description text
					let el = heading.nextElementSibling;
					// Also check if the description is inside a parent container after the heading
					if (!el && heading.parentElement) {
						el = heading.parentElement.nextElementSibling;
					}
					while (el) {
						const tag = (el.tagName || "").toLowerCase();
						// Stop at the next major heading/section
						if (/^h[1-6]$/.test(tag)) break;
						const t = (el.textContent || "").trim();
						if (t.length > 20) {
							description = t;
							break;
						}
						el = el.nextElementSibling;
					}
					break;
				}
			}

			const bodyText = document.body?.innerText || "";
			return { title, thumbnail, bodyText, description };
		});

		return {
			...dom,
			availabilityEntries,
			availabilityUrl: availabilityEntries[0]?.availabilityUrl || null,
			dateLabel: availabilityEntries[0]?.dateLabel || null,
		};
	} finally {
		await page.close().catch(() => {});
	}
}

function extractItemUrlsFromItemsListing(html) {
	const urls = new Set();
	for (const m of html.matchAll(/https:\/\/fareharbor\.com\/embeds\/book\/[^\s"']+\/items\/\d+\/?[^"'\s<]*/gi)) {
		urls.add(m[0]);
	}
	// Also handle relative links.
	for (const m of html.matchAll(/href=["'](\/embeds\/book\/[\w-]+\/items\/\d+\/?[^"']*)["']/gi)) {
		try {
			urls.add(new URL(m[1], "https://fareharbor.com").toString());
		} catch {
			// skip bad link
		}
	}
	return [...urls];
}

function normalizeFareharborUrl(url) {
	// Make URL absolute.
	try {
		return new URL(url, "https://fareharbor.com").toString();
	} catch {
		return url;
	}
}

function isFareharborEvent(e) {
	try {
		const u = new URL(e.url);
		return u.hostname.includes("fareharbor.com") && u.pathname.includes(`/embeds/book/${COMPANY}/items/`);
	} catch {
		return false;
	}
}

function itemIdFromFareharborUrl(url) {
	const m = String(url || "").match(/\/items\/(\d+)\b/i);
	return m ? m[1] : null;
}

async function main() {
	const listingUrl = `https://fareharbor.com/embeds/book/${COMPANY}/items/?flow=${encodeURIComponent(FLOW)}&full-items=yes`;
	console.log(`Fetching items listing: ${listingUrl}`);

	let itemUrls = [];
	let usedBrowser = false;
	const MAX_LISTING_ATTEMPTS = 3;
	let listingError = null;
	for (let attempt = 1; attempt <= MAX_LISTING_ATTEMPTS; attempt++) {
		try {
			const got = await getItemUrlsFromListing(listingUrl);
			itemUrls = got.itemUrls;
			usedBrowser = got.usedBrowser;
			listingError = null;
			if (itemUrls.length > 0) break;
			if (attempt < MAX_LISTING_ATTEMPTS) {
				console.warn(`Listing returned 0 items on attempt ${attempt}/${MAX_LISTING_ATTEMPTS}; retrying in 3 s…`);
				await sleep(3000);
			}
		} catch (err) {
			listingError = err;
			if (attempt < MAX_LISTING_ATTEMPTS) {
				console.warn(`Listing attempt ${attempt}/${MAX_LISTING_ATTEMPTS} failed (${err?.message || err}); retrying in 3 s…`);
				await sleep(3000);
			}
		}
	}

	if (itemUrls.length === 0) {
		const reason = listingError ? (listingError?.message || listingError) : "returned 0 items";
		console.warn(`Listing scrape failed (${reason}). Falling back to existing events.json item IDs.`);
		let existing = [];
		try {
			existing = JSON.parse(await fs.readFile(EVENTS_FILE, "utf8"));
			if (!Array.isArray(existing)) existing = [];
		} catch {
			existing = [];
		}
		const ids = existing
			.filter(isFareharborEvent)
			.map((e) => itemIdFromFareharborUrl(e.url))
			.filter(Boolean);
		itemUrls = [...new Set(ids)].map(
			(id) => `https://fareharbor.com/embeds/book/${COMPANY}/items/${id}/?full-items=yes&flow=${encodeURIComponent(FLOW)}`
		);
		usedBrowser = false;
	}

	const uniqueItemUrls = itemUrls.slice(0, 50);
	console.log(`Found ${uniqueItemUrls.length} item link(s).${usedBrowser ? " (via browser render)" : ""}`);

	let keep = [];
	if (MERGE_EXISTING) {
		let existing = [];
		try {
			existing = JSON.parse(await fs.readFile(EVENTS_FILE, "utf8"));
			if (!Array.isArray(existing)) existing = [];
		} catch {
			existing = [];
		}
		keep = existing.filter((e) => !isFareharborEvent(e));
		console.log(`Merging: keeping ${keep.length} non-FareHarbor event(s) from existing file.`);
	} else {
		console.log("Overwrite mode: output will match FareHarbor booking flow exactly.");
	}
	const scraped = [];

	const processItems = async () => {
		for (let i = 0; i < uniqueItemUrls.length; i++) {
			const itemUrl = uniqueItemUrls[i];
			console.log(`\n[${i + 1}/${uniqueItemUrls.length}] Fetching item: ${itemUrl}`);

			let html = null;
			try {
				html = await fetchHtml(itemUrl);
			} catch (err) {
				console.warn(`  Skipping (fetch failed): ${err?.message || err}`);
				continue;
			}

			let title = extractTitleFromHtml(html) || "Untitled Event";
			let thumbnail = extractBestImageFromHtml(html, itemUrl);
			let description = extractDescriptionFromHtml(html);
			let availabilityEntries = parsePricesForAnchors(html);
			let prices = availabilityEntries[0] || null;
			let bodyText = html;
			let trFromText = parseEventTimeRange(bodyText || "") || parseStartTimeAndDuration(bodyText || "");

			// If static HTML misses data, use browser render fallback.
			if (!prices || !trFromText) {
				let dom;
				try {
					dom = await withPlaywright(async ({ context }) => {
						return await scrapeItemViaPlaywright(context, itemUrl);
					});
				} catch (err) {
					console.warn(`  Skipping (browser fallback failed): ${err?.message || err}`);
					// If availability exists, keep going with fallback defaults.
					if (!prices) continue;
				}

				if (dom?.title) title = dom.title;
				if (dom?.thumbnail) thumbnail = dom.thumbnail;
				if (dom?.description) description = dom.description;
				if (dom?.availabilityEntries?.length) {
					availabilityEntries = dom.availabilityEntries;
					prices = availabilityEntries[0];
				} else if (dom?.availabilityUrl && dom?.dateLabel) {
					availabilityEntries = [{ availabilityUrl: dom.availabilityUrl, dateLabel: dom.dateLabel }];
					prices = availabilityEntries[0];
				}
				if (dom?.bodyText) bodyText = dom.bodyText;
				if (!description || /<[^>]+>/.test(description)) description = extractDescriptionFromText(bodyText);
				trFromText = parseEventTimeRange(bodyText || "") || parseStartTimeAndDuration(bodyText || "");
			}

			if (!availabilityEntries.length) {
				console.warn("  No availability found; skipping.");
				continue;
			}

			for (const availability of availabilityEntries) {
				let startIso;
				let endIso;
				const availabilityUrl = normalizeFareharborUrl(availability.availabilityUrl);
				// FareHarbor's API is the source of truth for times; description text can omit all time/duration details.
				const apiTimes = await fetchFareharborAvailabilityTimes(availabilityUrl);
				if (apiTimes) {
					startIso = apiTimes.startAt;
					endIso = apiTimes.endAt;
				} else {
					const ymd = parseDateLabelToYmd(availability.dateLabel);
					if (!ymd) {
						console.warn(`  Could not parse date from: ${availability.dateLabel}`);
						continue;
					}

					const availabilityStart = parseDateLabelToTime(availability.dateLabel);
					const availabilityStartsAtMidnight =
						availabilityStart?.h === 12 && availabilityStart?.m === 0 && availabilityStart?.ap === "AM";
					const durationMinutes = parseDurationMinutes(bodyText || "");
					const tr =
						trFromText ||
						(availabilityStart && !availabilityStartsAtMidnight && durationMinutes
							? timeRangeFromStartAndMinutes(availabilityStart, durationMinutes)
							: null) ||
						(availabilityStart && !availabilityStartsAtMidnight
							? timeRangeFromStartAndMinutes(availabilityStart, 120)
							: null);
					if (tr) {
						const s = to24Hour(tr.start);
						const e = to24Hour(tr.end);
						startIso = ymdAndTimeToIsoLocal(ymd, s.hour, s.minute);
						endIso = ymdAndTimeToIsoLocal(ymd, e.hour, e.minute);
					} else {
						startIso = ymdAndTimeToIsoLocal(ymd, 10, 0);
						endIso = ymdAndTimeToIsoLocal(ymd, 20, 0);
					}
				}

				scraped.push({
					title,
					start: startIso,
					end: endIso,
					url: availabilityUrl,
					thumbnail: thumbnail || undefined,
					description: description || undefined,
				});
			}

			await sleep(250);
		}
	};

	await processItems();

	// Clean + dedupe
	const byKey = new Map();
	for (const e of scraped) {
		const clean = {
			title: e.title,
			start: e.start,
			end: e.end,
			url: e.url,
		};
		if (e.thumbnail) clean.thumbnail = e.thumbnail;
		if (e.description) clean.description = e.description;

		const key = `${clean.url}::${clean.start}`;
		if (!byKey.has(key)) byKey.set(key, clean);
	}

	const todayYmd = todayYmdInTimeZone(TIME_ZONE);
	const out = [...keep, ...byKey.values()].filter((e) => {
		// Keep manual kept events; filter FareHarbor by date.
		if (keep.length && !isFareharborEvent(e)) return true;
		const endYmd = String(e.end || e.start || "").slice(0, 10);
		return endYmd && endYmd >= todayYmd;
	});

	out.sort((a, b) => String(a.start).localeCompare(String(b.start)));

	if (!SHOULD_WRITE) {
		console.log(`\nDry-run: would write ${out.length} event(s) to ${EVENTS_FILE}.`);
		console.log("First few:");
		for (const e of out.slice(0, 5)) {
			console.log(`- ${e.start} ${e.title}`);
		}
		return;
	}

	if (!ALLOW_EMPTY_WRITE && out.length === 0) {
		console.error(
			`Refusing to overwrite ${EVENTS_FILE} with 0 events. (Scrape likely failed; re-run or pass --allow-empty to force.)`
		);
		process.exitCode = 2;
		return;
	}

	await fs.writeFile(EVENTS_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
	console.log(`\nWrote ${out.length} event(s) to ${EVENTS_FILE}`);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
