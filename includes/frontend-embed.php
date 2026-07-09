<?php
/**
 * Front-end event calendar embed plumbing.
 *
 * @package FloridaRAMAEvents
 */

/**
 * Print the REST feed URL expected by the vendored calendar embeds.
 */
function floridarama_events_print_data_url() {
  $events_data_url = esc_url_raw( rest_url( 'floridarama/v1/events' ) );

  echo '<script>window.FR_EVENTS_DATA_URL=' . wp_json_encode( $events_data_url ) . ';</script>' . "\n";
}
add_action( 'wp_head', 'floridarama_events_print_data_url', 2 );

/**
 * Rewrite stored GitHub Pages event embed assets to this plugin's local assets.
 */
function floridarama_events_rewrite_embed_asset_urls( $content ) {
  if ( ! is_string( $content ) || '' === $content ) {
    return $content;
  }

  $plugin_dir = trailingslashit( FLORIDARAMA_EVENTS_PLUGIN_DIR );
  $plugin_uri = trailingslashit( FLORIDARAMA_EVENTS_PLUGIN_URL );

  $grid_version     = @filemtime( $plugin_dir . 'assets/vendor/events-calendar/grid-embed.js' );
  $calendar_version = @filemtime( $plugin_dir . 'assets/vendor/events-calendar/calendar-embed.js' );
  $styles_version   = @filemtime( $plugin_dir . 'assets/vendor/events-calendar/shared.css' );

  $grid_embed_src = add_query_arg(
    'ver',
    $grid_version ?: '1.0',
    $plugin_uri . 'assets/vendor/events-calendar/grid-embed.js'
  );
  $calendar_embed_src = add_query_arg(
    'ver',
    $calendar_version ?: '1.0',
    $plugin_uri . 'assets/vendor/events-calendar/calendar-embed.js'
  );
  $events_styles_src = add_query_arg(
    'ver',
    $styles_version ?: '1.0',
    $plugin_uri . 'assets/vendor/events-calendar/shared.css'
  );

  $asset_map = array(
    'https://novakukla.github.io/FloridaRAMA-events-calendar/grid-embed.js'     => $grid_embed_src,
    'https://novakukla.github.io/FloridaRAMA-events-calendar/calendar-embed.js' => $calendar_embed_src,
    'https://novakukla.github.io/FloridaRAMA-events-calendar/shared.css'        => $events_styles_src,
  );

  foreach ( $asset_map as $remote => $local ) {
    $content = str_replace( $remote, esc_url( $local ), $content );
  }

  $grid_embed_src = esc_url( $grid_embed_src );
  $grid_pattern   = '~<script\b([^>]*)\bsrc=(["\'])(' . preg_quote( $grid_embed_src, '~' ) . ')\2([^>]*)>\s*</script>~i';

  $content = preg_replace_callback(
    $grid_pattern,
    function( $matches ) {
      $src = isset( $matches[3] ) ? (string) $matches[3] : '';

      return '<script type="application/json" data-fr-events-grid-src="' . esc_url( $src ) . '"></script>';
    },
    $content
  );

  return is_string( $content ) ? $content : '';
}
add_filter( 'the_content', 'floridarama_events_rewrite_embed_asset_urls', 11 );
add_filter( 'widget_text_content', 'floridarama_events_rewrite_embed_asset_urls', 11 );

/**
 * Return the lazy-loader used for the grid embed.
 */
function floridarama_events_grid_loader_script() {
  return <<<'JS'
(function() {
  function loadGridEmbed() {
    var marker = document.querySelector('script[data-fr-events-grid-src]');
    if (!marker || marker.dataset.frEventsGridLoaded === '1') return;

    marker.dataset.frEventsGridLoaded = '1';
    var script = document.createElement('script');
    script.src = marker.getAttribute('data-fr-events-grid-src');
    script.async = true;
    marker.parentNode.insertBefore(script, marker.nextSibling);
  }

  function initGridEmbedLoader() {
    var marker = document.querySelector('script[data-fr-events-grid-src]');
    if (!marker) return;

    var root = document.getElementById('fr-grid-root');
    if (root && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          loadGridEmbed();
        });
      }, { rootMargin: '700px 0px' });

      observer.observe(root);
    } else {
      window.addEventListener('load', loadGridEmbed, { once: true });
    }

    window.addEventListener('load', function() {
      window.setTimeout(loadGridEmbed, 3500);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGridEmbedLoader);
  } else {
    initGridEmbedLoader();
  }
})();
JS;
}

/**
 * Attach the grid loader after the theme's main script, with a footer fallback.
 */
function floridarama_events_enqueue_grid_loader() {
  $loader = floridarama_events_grid_loader_script();

  if ( wp_script_is( 'floridarama-main', 'enqueued' ) ) {
    wp_add_inline_script( 'floridarama-main', $loader, 'after' );
    return;
  }

  add_action( 'wp_footer', 'floridarama_events_print_grid_loader', 20 );
}
add_action( 'wp_enqueue_scripts', 'floridarama_events_enqueue_grid_loader', 20 );

/**
 * Print the grid loader when the theme's main script is not available.
 */
function floridarama_events_print_grid_loader() {
  echo '<script>' . floridarama_events_grid_loader_script() . '</script>' . "\n";
}
