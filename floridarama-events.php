<?php
/**
 * Plugin Name: FloridaRAMA Events
 * Description: FloridaRAMA events manager, REST feed, and calendar embed plumbing.
 * Version: 1.0.0
 * Author: FloridaRAMA
 * Text Domain: floridarama
 *
 * @package FloridaRAMAEvents
 */

if ( ! defined( 'ABSPATH' ) ) {
  exit;
}

define( 'FLORIDARAMA_EVENTS_PLUGIN_FILE', __FILE__ );
define( 'FLORIDARAMA_EVENTS_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'FLORIDARAMA_EVENTS_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once FLORIDARAMA_EVENTS_PLUGIN_DIR . 'includes/events-calendar.php';
require_once FLORIDARAMA_EVENTS_PLUGIN_DIR . 'includes/frontend-embed.php';

/**
 * Keep role capabilities in place when the plugin is activated.
 */
function floridarama_events_plugin_activate() {
  if ( function_exists( 'floridarama_sync_event_role_capabilities' ) ) {
    floridarama_sync_event_role_capabilities();
  }
}
register_activation_hook( __FILE__, 'floridarama_events_plugin_activate' );
