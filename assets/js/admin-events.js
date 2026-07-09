(function () {
  "use strict";

  function config(key, fallback) {
    return window.floridaramaEventsAdmin && window.floridaramaEventsAdmin[key]
      ? window.floridaramaEventsAdmin[key]
      : fallback;
  }

  function initImagePicker(form) {
    var selectButton = form.querySelector("[data-fr-event-image-select]");
    var removeButton = form.querySelector("[data-fr-event-image-remove]");
    var imageId = form.querySelector("[data-fr-event-image-id]");
    var imageUrl = form.querySelector("[data-fr-event-image-url]");
    var preview = form.querySelector("[data-fr-event-image-preview]");
    var wrap = form.querySelector("[data-fr-event-image-wrap]");
    var frame = null;

    if (!selectButton || !imageId || !imageUrl || !preview || !wrap || !window.wp || !window.wp.media) {
      return;
    }

    selectButton.addEventListener("click", function (event) {
      event.preventDefault();

      if (!frame) {
        frame = window.wp.media({
          title: config("mediaTitle", "Choose an event image"),
          button: { text: config("mediaButton", "Use this image") },
          library: { type: "image" },
          multiple: false,
        });

        frame.on("select", function () {
          var attachment = frame.state().get("selection").first().toJSON();
          var chosenUrl = attachment.url || "";

          if (attachment.sizes) {
            chosenUrl = attachment.sizes.medium_large
              ? attachment.sizes.medium_large.url
              : attachment.sizes.medium
                ? attachment.sizes.medium.url
                : chosenUrl;
          }

          imageId.value = attachment.id || "";
          imageUrl.value = "";
          preview.src = chosenUrl;
          preview.hidden = !chosenUrl;
          wrap.classList.toggle("has-image", Boolean(chosenUrl));

          if (removeButton) removeButton.hidden = !chosenUrl;
        });
      }

      frame.open();
    });

    if (removeButton) {
      removeButton.addEventListener("click", function (event) {
        event.preventDefault();
        imageId.value = "";
        imageUrl.value = "";
        preview.src = "";
        preview.hidden = true;
        removeButton.hidden = true;
        wrap.classList.remove("has-image");
      });
    }
  }

  function initDateValidation(form) {
    var start = form.querySelector("[data-fr-event-start]");
    var end = form.querySelector("[data-fr-event-end]");

    if (!start || !end) return;

    function syncMinimum() {
      end.min = start.value || "";
      end.setCustomValidity("");
    }

    start.addEventListener("change", syncMinimum);
    end.addEventListener("change", function () {
      end.setCustomValidity("");
    });

    form.addEventListener("submit", function (event) {
      if (start.value && end.value && end.value <= start.value) {
        end.setCustomValidity(config("endBeforeStart", "The end date must be after the start date."));
        end.reportValidity();
        event.preventDefault();
      }
    });

    syncMinimum();
  }

  function applyFilter(root, filter) {
    var rows = Array.prototype.slice.call(root.querySelectorAll("[data-fr-event-row]"));
    var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-fr-event-filter]"));
    var empty = root.querySelector("[data-fr-events-empty]");
    var visible = 0;

    rows.forEach(function (row) {
      var status = row.getAttribute("data-fr-event-status") || "";
      var show = filter === "all" || status === filter;

      row.hidden = !show;
      if (show) visible += 1;
    });

    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-fr-event-filter") === filter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (empty) empty.hidden = visible !== 0;
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-fr-event-form]").forEach(function (form) {
      initImagePicker(form);
      initDateValidation(form);
    });

    document.querySelectorAll(".fr-events-admin").forEach(function (root) {
      root.querySelectorAll("[data-fr-event-filter]").forEach(function (tab) {
        tab.addEventListener("click", function () {
          applyFilter(root, tab.getAttribute("data-fr-event-filter") || "upcoming");
        });
      });

      applyFilter(root, "upcoming");
    });
  });
})();
