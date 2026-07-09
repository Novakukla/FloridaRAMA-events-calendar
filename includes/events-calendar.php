<?php
/**
 * Events manager and public calendar feed.
 *
 * Manual events live in WordPress. FareHarbor events remain synchronized by
 * the existing GitHub workflow and are cached server-side before being merged.
 *
 * @package FloridaRAMA
 */

/**
 * Return the capability required to manage manual events.
 */
function floridarama_events_capability() {
  return 'edit_fr_events';
}

/**
 * Return the primitive capabilities used by manual events.
 */
function floridarama_event_role_capabilities() {
  return array(
    'edit_fr_events',
    'edit_others_fr_events',
    'edit_published_fr_events',
    'publish_fr_events',
    'delete_fr_events',
    'delete_others_fr_events',
    'delete_published_fr_events',
  );
}

/**
 * Allow site authors and higher roles to manage all manual events.
 */
function floridarama_sync_event_role_capabilities() {
  $capability_version = '1';

  if ( $capability_version === get_option( 'floridarama_event_capability_version' ) ) {
    return;
  }

  foreach ( array( 'author', 'editor', 'administrator' ) as $role_name ) {
    $role = get_role( $role_name );
    if ( ! $role ) {
      continue;
    }

    foreach ( floridarama_event_role_capabilities() as $capability ) {
      $role->add_cap( $capability );
    }
  }

  update_option( 'floridarama_event_capability_version', $capability_version, false );

  $current_user = wp_get_current_user();
  if ( $current_user->exists() ) {
    $current_user->get_role_caps();
  }
}
add_action( 'admin_init', 'floridarama_sync_event_role_capabilities', 5 );

/**
 * Register private manual event records.
 */
function floridarama_register_event_post_type() {
  register_post_type(
    'fr_event',
    array(
      'labels' => array(
        'name'          => __( 'Events', 'floridarama' ),
        'singular_name' => __( 'Event', 'floridarama' ),
      ),
      'public'              => false,
      'publicly_queryable'  => false,
      'show_ui'             => false,
      'show_in_rest'        => false,
      'supports'            => array( 'title', 'editor', 'thumbnail', 'revisions' ),
      'capability_type'      => array( 'fr_event', 'fr_events' ),
      'has_archive'         => false,
      'rewrite'             => false,
      'exclude_from_search' => true,
      'map_meta_cap'        => true,
    )
  );
}
add_action( 'init', 'floridarama_register_event_post_type' );

/**
 * Register the simplified Events manager.
 */
function floridarama_register_events_admin_page() {
  add_menu_page(
    __( 'Events', 'floridarama' ),
    __( 'Events', 'floridarama' ),
    floridarama_events_capability(),
    'floridarama-events',
    'floridarama_render_events_admin_page',
    'dashicons-calendar-alt',
    28
  );
}
add_action( 'admin_menu', 'floridarama_register_events_admin_page' );

/**
 * Enqueue Events manager assets.
 */
function floridarama_enqueue_events_admin_assets( $hook_suffix ) {
  if ( 'toplevel_page_floridarama-events' !== $hook_suffix ) {
    return;
  }

  $plugin_dir = trailingslashit( FLORIDARAMA_EVENTS_PLUGIN_DIR );
  $plugin_uri = trailingslashit( FLORIDARAMA_EVENTS_PLUGIN_URL );

  wp_enqueue_media();

  $css_version = @filemtime( $plugin_dir . 'assets/css/admin-events.css' );
  if ( ! $css_version ) {
    $css_version = '1.0';
  }

  wp_enqueue_style(
    'floridarama-events-admin',
    $plugin_uri . 'assets/css/admin-events.css',
    array(),
    (string) $css_version
  );

  $js_version = @filemtime( $plugin_dir . 'assets/js/admin-events.js' );
  if ( ! $js_version ) {
    $js_version = '1.0';
  }

  wp_enqueue_script(
    'floridarama-events-admin',
    $plugin_uri . 'assets/js/admin-events.js',
    array(),
    (string) $js_version,
    true
  );

  wp_localize_script(
    'floridarama-events-admin',
    'floridaramaEventsAdmin',
    array(
      'mediaTitle'  => __( 'Choose an event image', 'floridarama' ),
      'mediaButton' => __( 'Use this image', 'floridarama' ),
      'endBeforeStart' => __( 'The end date must be after the start date.', 'floridarama' ),
    )
  );
}
add_action( 'admin_enqueue_scripts', 'floridarama_enqueue_events_admin_assets' );

/**
 * Normalize a local datetime value to the calendar JSON format.
 */
function floridarama_normalize_event_datetime( $value ) {
  $value = trim( sanitize_text_field( (string) $value ) );

  if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/', $value, $matches ) ) {
    return '';
  }

  $year   = (int) $matches[1];
  $month  = (int) $matches[2];
  $day    = (int) $matches[3];
  $hour   = (int) $matches[4];
  $minute = (int) $matches[5];
  $second = isset( $matches[6] ) ? (int) $matches[6] : 0;

  if ( ! checkdate( $month, $day, $year ) || $hour > 23 || $minute > 59 || $second > 59 ) {
    return '';
  }

  return sprintf( '%04d-%02d-%02dT%02d:%02d:%02d', $year, $month, $day, $hour, $minute, $second );
}

/**
 * Format an event datetime for wp-admin.
 */
function floridarama_format_event_datetime( $value ) {
  $value = floridarama_normalize_event_datetime( $value );
  if ( '' === $value ) {
    return '';
  }

  $date = DateTimeImmutable::createFromFormat( '!Y-m-d\TH:i:s', $value, wp_timezone() );
  if ( ! $date ) {
    return '';
  }

  return wp_date(
    get_option( 'date_format' ) . ' ' . get_option( 'time_format' ),
    $date->getTimestamp(),
    wp_timezone()
  );
}

/**
 * Set an Events manager notice for the current user.
 */
function floridarama_set_events_notice( $message, $type = 'success' ) {
  set_transient(
    'floridarama_events_notice_' . get_current_user_id(),
    array(
      'message' => sanitize_text_field( (string) $message ),
      'type'    => 'error' === $type ? 'error' : 'success',
    ),
    MINUTE_IN_SECONDS
  );
}

/**
 * Return manual event posts for the manager.
 */
function floridarama_get_event_admin_rows() {
  return get_posts(
    array(
      'post_type'      => 'fr_event',
      'post_status'    => array( 'publish', 'draft' ),
      'posts_per_page' => -1,
      'meta_key'       => 'fr_event_start',
      'orderby'        => 'meta_value',
      'order'          => 'ASC',
      'no_found_rows'  => true,
    )
  );
}

/**
 * Return the preferred image URL for a manual event.
 */
function floridarama_get_event_image_url( $post_id, $size = 'large' ) {
  $post_id       = (int) $post_id;
  $attachment_id = get_post_thumbnail_id( $post_id );

  if ( $attachment_id ) {
    $image = wp_get_attachment_image_url( $attachment_id, $size );
    if ( $image ) {
      return $image;
    }
  }

  return esc_url_raw( (string) get_post_meta( $post_id, 'fr_event_image_url', true ) );
}

/**
 * Render the add/edit manual event form.
 */
function floridarama_render_event_admin_form( $post = null ) {
  $post_id      = $post ? (int) $post->ID : 0;
  $title        = $post_id > 0 ? get_the_title( $post_id ) : '';
  $description  = $post_id > 0 ? (string) $post->post_content : '';
  $start        = $post_id > 0 ? (string) get_post_meta( $post_id, 'fr_event_start', true ) : '';
  $end          = $post_id > 0 ? (string) get_post_meta( $post_id, 'fr_event_end', true ) : '';
  $url          = $post_id > 0 ? (string) get_post_meta( $post_id, 'fr_event_url', true ) : '';
  $legacy_id    = $post_id > 0 ? (string) get_post_meta( $post_id, 'fr_event_legacy_id', true ) : '';
  $image_id     = $post_id > 0 ? (int) get_post_thumbnail_id( $post_id ) : 0;
  $external_url = $post_id > 0 ? (string) get_post_meta( $post_id, 'fr_event_image_url', true ) : '';
  $image_url    = $post_id > 0 ? floridarama_get_event_image_url( $post_id, 'medium_large' ) : '';
  $status       = $post_id > 0 && 'draft' === $post->post_status ? 'draft' : 'publish';
  ?>
  <form class="fr-events-admin-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-fr-event-form>
    <input type="hidden" name="action" value="floridarama_save_event" />
    <input type="hidden" name="post_id" value="<?php echo esc_attr( $post_id ); ?>" />
    <input type="hidden" name="fr_event_legacy_id" value="<?php echo esc_attr( $legacy_id ); ?>" />
    <?php wp_nonce_field( 'floridarama_save_event' ); ?>

    <div class="fr-events-admin-form__header">
      <h2><?php echo $post_id > 0 ? esc_html__( 'Edit Manual Event', 'floridarama' ) : esc_html__( 'Add Manual Event', 'floridarama' ); ?></h2>
      <?php if ( $post_id > 0 ) : ?>
        <a class="button fr-events-admin-form__cancel" href="<?php echo esc_url( admin_url( 'admin.php?page=floridarama-events' ) ); ?>"><?php esc_html_e( 'Cancel Edit', 'floridarama' ); ?></a>
      <?php endif; ?>
    </div>

    <div class="fr-events-admin-form__grid">
      <label class="fr-events-admin-field fr-events-admin-field--wide">
        <span><?php esc_html_e( 'Event Name', 'floridarama' ); ?></span>
        <input type="text" class="regular-text" name="title" value="<?php echo esc_attr( $title ); ?>" required />
      </label>

      <label class="fr-events-admin-field">
        <span><?php esc_html_e( 'Starts', 'floridarama' ); ?></span>
        <input type="datetime-local" name="fr_event_start" value="<?php echo esc_attr( $start ? substr( $start, 0, 16 ) : '' ); ?>" required step="900" data-fr-event-start />
      </label>

      <label class="fr-events-admin-field">
        <span><?php esc_html_e( 'Ends', 'floridarama' ); ?></span>
        <input type="datetime-local" name="fr_event_end" value="<?php echo esc_attr( $end ? substr( $end, 0, 16 ) : '' ); ?>" step="900" data-fr-event-end />
        <small><?php esc_html_e( 'Optional. Leave blank for an event with no listed end time.', 'floridarama' ); ?></small>
      </label>

      <label class="fr-events-admin-field">
        <span><?php esc_html_e( 'Calendar Status', 'floridarama' ); ?></span>
        <select name="post_status">
          <option value="publish" <?php selected( $status, 'publish' ); ?>><?php esc_html_e( 'Published', 'floridarama' ); ?></option>
          <option value="draft" <?php selected( $status, 'draft' ); ?>><?php esc_html_e( 'Draft / Hidden', 'floridarama' ); ?></option>
        </select>
      </label>

      <label class="fr-events-admin-field fr-events-admin-field--wide">
        <span><?php esc_html_e( 'Ticket or Event Link', 'floridarama' ); ?></span>
        <input type="url" class="regular-text" name="fr_event_url" value="<?php echo esc_attr( $url ); ?>" placeholder="https://..." />
      </label>

      <label class="fr-events-admin-field fr-events-admin-field--wide">
        <span><?php esc_html_e( 'Description', 'floridarama' ); ?></span>
        <textarea name="description" rows="7" placeholder="<?php esc_attr_e( 'Tell visitors what the event is about.', 'floridarama' ); ?>"><?php echo esc_textarea( $description ); ?></textarea>
      </label>

      <div class="fr-events-admin-field fr-events-admin-field--wide">
        <span><?php esc_html_e( 'Event Image', 'floridarama' ); ?></span>
        <input type="hidden" name="fr_event_image_id" value="<?php echo esc_attr( $image_id ); ?>" data-fr-event-image-id />
        <input type="hidden" name="fr_event_image_url" value="<?php echo esc_attr( $external_url ); ?>" data-fr-event-image-url />
        <div class="fr-events-admin-image<?php echo $image_url ? ' has-image' : ''; ?>" data-fr-event-image-wrap>
          <img src="<?php echo esc_url( $image_url ); ?>" alt="" data-fr-event-image-preview <?php echo $image_url ? '' : 'hidden'; ?> />
          <div class="fr-events-admin-image__actions">
            <button type="button" class="button button-secondary" data-fr-event-image-select><?php esc_html_e( 'Choose from Media Library', 'floridarama' ); ?></button>
            <button type="button" class="button button-link-delete" data-fr-event-image-remove <?php echo $image_url ? '' : 'hidden'; ?>><?php esc_html_e( 'Remove Image', 'floridarama' ); ?></button>
          </div>
        </div>
      </div>
    </div>

    <div class="fr-events-admin-form__actions">
      <?php submit_button( $post_id > 0 ? __( 'Save Event', 'floridarama' ) : __( 'Add Event', 'floridarama' ), 'primary', 'submit', false ); ?>
    </div>
  </form>
  <?php
}

/**
 * Render the Events manager.
 */
function floridarama_render_events_admin_page() {
  if ( ! current_user_can( floridarama_events_capability() ) ) {
    return;
  }

  $edit_id      = isset( $_GET['edit_event'] ) ? absint( $_GET['edit_event'] ) : 0;
  $editing_post = $edit_id > 0 && 'fr_event' === get_post_type( $edit_id ) ? get_post( $edit_id ) : null;
  $rows         = floridarama_get_event_admin_rows();
  $notice_key   = 'floridarama_events_notice_' . get_current_user_id();
  $notice       = get_transient( $notice_key );
  $now          = current_time( 'Y-m-d\TH:i:s' );
  $migration_complete = (bool) get_option( 'floridarama_events_migration_complete', false );

  if ( $notice ) {
    delete_transient( $notice_key );
  }
  ?>
  <div class="wrap fr-events-admin">
    <h1><?php esc_html_e( 'Manage Events', 'floridarama' ); ?></h1>

    <div class="fr-events-admin-intro">
      <div>
        <h2><?php esc_html_e( 'One calendar, two event sources', 'floridarama' ); ?></h2>
        <p><?php esc_html_e( 'FareHarbor events continue to sync automatically. Use this screen for gallery openings, promotions, community events, and anything that is not managed in FareHarbor.', 'floridarama' ); ?></p>
      </div>
      <?php if ( current_user_can( 'manage_options' ) ) : ?>
        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
          <input type="hidden" name="action" value="floridarama_import_legacy_events" />
          <?php wp_nonce_field( 'floridarama_import_legacy_events' ); ?>
          <button type="submit" class="button button-secondary" onclick="return confirm('<?php echo esc_js( __( 'Import or refresh events from the old GitHub manual-events.json file?', 'floridarama' ) ); ?>');">
            <?php echo $migration_complete ? esc_html__( 'Refresh Imported Events', 'floridarama' ) : esc_html__( 'Import Old Manual Events', 'floridarama' ); ?>
          </button>
          <p class="description">
            <?php
            echo $migration_complete
              ? esc_html__( 'Migration is complete. Use refresh only if the old JSON changed before the team switched to WordPress.', 'floridarama' )
              : esc_html__( 'Until this import runs, the public calendar temporarily includes the old manual JSON so no events disappear.', 'floridarama' );
            ?>
          </p>
        </form>
      <?php endif; ?>
    </div>

    <?php if ( is_array( $notice ) && ! empty( $notice['message'] ) ) : ?>
      <div class="notice <?php echo 'error' === $notice['type'] ? 'notice-error' : 'notice-success'; ?> is-dismissible"><p><?php echo esc_html( $notice['message'] ); ?></p></div>
    <?php endif; ?>

    <div class="fr-events-admin-layout">
      <section class="fr-events-admin-panel fr-events-admin-panel--editor">
        <?php floridarama_render_event_admin_form( $editing_post ); ?>
      </section>

      <section class="fr-events-admin-panel fr-events-admin-panel--list">
        <div class="fr-events-admin-list-header">
          <h2><?php esc_html_e( 'Current Manual Events', 'floridarama' ); ?></h2>
          <div class="fr-events-admin-tabs" role="tablist" aria-label="<?php esc_attr_e( 'Filter manual events', 'floridarama' ); ?>">
            <button type="button" class="fr-events-admin-tab is-active" role="tab" aria-selected="true" data-fr-event-filter="upcoming"><?php esc_html_e( 'Upcoming', 'floridarama' ); ?></button>
            <button type="button" class="fr-events-admin-tab" role="tab" aria-selected="false" data-fr-event-filter="past"><?php esc_html_e( 'Past', 'floridarama' ); ?></button>
            <button type="button" class="fr-events-admin-tab" role="tab" aria-selected="false" data-fr-event-filter="draft"><?php esc_html_e( 'Drafts', 'floridarama' ); ?></button>
            <button type="button" class="fr-events-admin-tab" role="tab" aria-selected="false" data-fr-event-filter="all"><?php esc_html_e( 'All', 'floridarama' ); ?></button>
          </div>
        </div>

        <div class="fr-events-admin-list" data-fr-events-list>
        <?php if ( $rows ) : ?>
          <?php foreach ( $rows as $row ) : ?>
            <?php
            $row_id     = (int) $row->ID;
            $row_start  = (string) get_post_meta( $row_id, 'fr_event_start', true );
            $row_end    = (string) get_post_meta( $row_id, 'fr_event_end', true );
            $row_url    = (string) get_post_meta( $row_id, 'fr_event_url', true );
            $row_image  = floridarama_get_event_image_url( $row_id, 'thumbnail' );
            $row_status = 'draft' === $row->post_status ? 'draft' : ( ( $row_end ?: $row_start ) < $now ? 'past' : 'upcoming' );
            $edit_url   = add_query_arg( 'edit_event', $row_id, admin_url( 'admin.php?page=floridarama-events' ) );
            $trash_url  = wp_nonce_url(
              add_query_arg(
                array(
                  'action'  => 'floridarama_trash_event',
                  'post_id' => $row_id,
                ),
                admin_url( 'admin-post.php' )
              ),
              'floridarama_trash_event_' . $row_id
            );
            ?>
            <article class="fr-events-admin-event" data-fr-event-row data-fr-event-status="<?php echo esc_attr( $row_status ); ?>">
              <div class="fr-events-admin-event__image">
                <?php if ( $row_image ) : ?>
                  <img src="<?php echo esc_url( $row_image ); ?>" alt="" />
                <?php else : ?>
                  <span class="dashicons dashicons-calendar-alt" aria-hidden="true"></span>
                <?php endif; ?>
              </div>
              <div class="fr-events-admin-event__details">
                <h3><?php echo esc_html( get_the_title( $row_id ) ); ?></h3>
                <p>
                  <?php echo esc_html( floridarama_format_event_datetime( $row_start ) ); ?>
                  <?php if ( $row_end ) : ?>
                    <span><?php echo esc_html( sprintf( __( ' - %s', 'floridarama' ), floridarama_format_event_datetime( $row_end ) ) ); ?></span>
                  <?php endif; ?>
                </p>
                <?php if ( 'draft' === $row->post_status ) : ?>
                  <span class="fr-events-admin-event__status"><?php esc_html_e( 'Draft / Hidden', 'floridarama' ); ?></span>
                <?php endif; ?>
              </div>
              <div class="fr-events-admin-event__actions">
                <a class="button fr-events-admin-button fr-events-admin-button--edit" href="<?php echo esc_url( $edit_url ); ?>">
                  <span class="dashicons dashicons-edit" aria-hidden="true"></span>
                  <?php esc_html_e( 'Edit', 'floridarama' ); ?>
                </a>
                <a class="button fr-events-admin-button fr-events-admin-button--remove" href="<?php echo esc_url( $trash_url ); ?>" onclick="return confirm('<?php echo esc_js( __( 'Move this event to the trash?', 'floridarama' ) ); ?>');">
                  <span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
                  <?php esc_html_e( 'Remove', 'floridarama' ); ?>
                </a>
                <?php if ( $row_url ) : ?>
                  <a class="fr-events-admin-event__link" href="<?php echo esc_url( $row_url ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Open link', 'floridarama' ); ?></a>
                <?php endif; ?>
              </div>
            </article>
          <?php endforeach; ?>
          <p class="fr-events-admin-empty" data-fr-events-empty hidden><?php esc_html_e( 'No manual events match this filter.', 'floridarama' ); ?></p>
        <?php else : ?>
          <p class="fr-events-admin-empty"><?php esc_html_e( 'No manual events yet. Add one or import the existing GitHub records.', 'floridarama' ); ?></p>
        <?php endif; ?>
        </div>
      </section>
    </div>
  </div>
  <?php
}

/**
 * Save a manual event from the manager.
 */
function floridarama_handle_event_save() {
  if ( ! current_user_can( floridarama_events_capability() ) ) {
    wp_die( esc_html__( 'You are not allowed to edit events.', 'floridarama' ) );
  }

  check_admin_referer( 'floridarama_save_event' );

  $post_id      = isset( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
  $existing     = $post_id > 0 ? get_post( $post_id ) : null;
  $title        = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
  $description  = isset( $_POST['description'] ) ? sanitize_textarea_field( wp_unslash( $_POST['description'] ) ) : '';
  $start        = isset( $_POST['fr_event_start'] ) ? floridarama_normalize_event_datetime( wp_unslash( $_POST['fr_event_start'] ) ) : '';
  $end_raw      = isset( $_POST['fr_event_end'] ) ? trim( (string) wp_unslash( $_POST['fr_event_end'] ) ) : '';
  $end          = '' !== $end_raw ? floridarama_normalize_event_datetime( $end_raw ) : '';
  $url          = isset( $_POST['fr_event_url'] ) ? esc_url_raw( wp_unslash( $_POST['fr_event_url'] ) ) : '';
  $status       = isset( $_POST['post_status'] ) && 'draft' === sanitize_key( wp_unslash( $_POST['post_status'] ) ) ? 'draft' : 'publish';
  $image_id     = isset( $_POST['fr_event_image_id'] ) ? absint( $_POST['fr_event_image_id'] ) : 0;
  $image_url    = isset( $_POST['fr_event_image_url'] ) ? esc_url_raw( wp_unslash( $_POST['fr_event_image_url'] ) ) : '';
  $legacy_id    = isset( $_POST['fr_event_legacy_id'] ) ? sanitize_text_field( wp_unslash( $_POST['fr_event_legacy_id'] ) ) : '';

  if ( $post_id > 0 && ( ! $existing || 'fr_event' !== $existing->post_type || ! current_user_can( 'edit_post', $post_id ) ) ) {
    wp_die( esc_html__( 'That event could not be found.', 'floridarama' ) );
  }

  if ( '' === $title || '' === $start || ( '' !== $end_raw && '' === $end ) ) {
    floridarama_set_events_notice( __( 'Event name and a valid start date are required.', 'floridarama' ), 'error' );
    wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
    exit;
  }

  if ( '' !== $end && $end <= $start ) {
    floridarama_set_events_notice( __( 'The event end date must be after its start date.', 'floridarama' ), 'error' );
    wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
    exit;
  }

  if ( $image_id > 0 && ! wp_attachment_is_image( $image_id ) ) {
    $image_id = 0;
  }

  $post_args = array(
    'post_type'    => 'fr_event',
    'post_title'   => $title,
    'post_content' => $description,
    'post_status'  => $status,
  );

  if ( $post_id > 0 ) {
    $post_args['ID'] = $post_id;
    $saved_post_id   = wp_update_post( wp_slash( $post_args ), true );
  } else {
    $saved_post_id = wp_insert_post( wp_slash( $post_args ), true );
  }

  if ( is_wp_error( $saved_post_id ) ) {
    floridarama_set_events_notice( $saved_post_id->get_error_message(), 'error' );
    wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
    exit;
  }

  $saved_post_id = (int) $saved_post_id;

  update_post_meta( $saved_post_id, 'fr_event_start', $start );
  update_post_meta( $saved_post_id, 'fr_event_end', $end );
  update_post_meta( $saved_post_id, 'fr_event_url', $url );
  update_post_meta( $saved_post_id, 'fr_event_image_url', $image_url );

  if ( '' !== $legacy_id ) {
    update_post_meta( $saved_post_id, 'fr_event_legacy_id', $legacy_id );
  }

  if ( $image_id > 0 ) {
    set_post_thumbnail( $saved_post_id, $image_id );
    delete_post_meta( $saved_post_id, 'fr_event_image_url' );
  } else {
    delete_post_thumbnail( $saved_post_id );
  }

  floridarama_set_events_notice( $post_id > 0 ? __( 'Event saved.', 'floridarama' ) : __( 'Event added.', 'floridarama' ) );
  wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
  exit;
}
add_action( 'admin_post_floridarama_save_event', 'floridarama_handle_event_save' );

/**
 * Trash one manual event.
 */
function floridarama_handle_event_trash() {
  if ( ! current_user_can( floridarama_events_capability() ) ) {
    wp_die( esc_html__( 'You are not allowed to delete events.', 'floridarama' ) );
  }

  $post_id = isset( $_GET['post_id'] ) ? absint( $_GET['post_id'] ) : 0;
  check_admin_referer( 'floridarama_trash_event_' . $post_id );

  if ( $post_id > 0 && 'fr_event' === get_post_type( $post_id ) && current_user_can( 'delete_post', $post_id ) ) {
    wp_trash_post( $post_id );
    floridarama_set_events_notice( __( 'Event moved to the trash.', 'floridarama' ) );
  }

  wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
  exit;
}
add_action( 'admin_post_floridarama_trash_event', 'floridarama_handle_event_trash' );

/**
 * Fetch and decode a trusted event JSON file.
 */
function floridarama_fetch_event_json( $url ) {
  $response = wp_safe_remote_get(
    $url,
    array(
      'timeout'     => 15,
      'redirection' => 3,
      'headers'     => array(
        'Accept'     => 'application/json',
        'User-Agent' => 'FloridaRAMA-WordPress/' . wp_get_theme()->get( 'Version' ),
      ),
    )
  );

  if ( is_wp_error( $response ) ) {
    return $response;
  }

  $status = (int) wp_remote_retrieve_response_code( $response );
  if ( 200 !== $status ) {
    return new WP_Error( 'floridarama_events_http_error', sprintf( __( 'The event source returned HTTP %d.', 'floridarama' ), $status ) );
  }

  $data = json_decode( wp_remote_retrieve_body( $response ), true );
  if ( ! is_array( $data ) ) {
    return new WP_Error( 'floridarama_events_json_error', __( 'The event source did not return a JSON array.', 'floridarama' ) );
  }

  return $data;
}

/**
 * Normalize an external event for the public feed.
 */
function floridarama_normalize_external_event( $event, $source = 'fareharbor' ) {
  if ( ! is_array( $event ) ) {
    return null;
  }

  $title = isset( $event['title'] ) ? sanitize_text_field( (string) $event['title'] ) : '';
  $start = isset( $event['start'] ) ? sanitize_text_field( (string) $event['start'] ) : '';

  if ( '' === $title || '' === $start ) {
    return null;
  }

  return array(
    'id'          => isset( $event['id'] ) ? sanitize_text_field( (string) $event['id'] ) : '',
    'title'       => $title,
    'start'       => $start,
    'end'         => isset( $event['end'] ) ? sanitize_text_field( (string) $event['end'] ) : '',
    'url'         => isset( $event['url'] ) ? esc_url_raw( (string) $event['url'] ) : '',
    'thumbnail'   => isset( $event['thumbnail'] ) ? esc_url_raw( (string) $event['thumbnail'] ) : '',
    'description' => isset( $event['description'] ) ? sanitize_textarea_field( (string) $event['description'] ) : '',
    'source'      => sanitize_key( $source ),
  );
}

/**
 * Return cached FareHarbor-synchronized events.
 */
function floridarama_get_synced_events() {
  $cached = get_transient( 'floridarama_synced_events' );
  if ( is_array( $cached ) && isset( $cached['events'] ) && is_array( $cached['events'] ) ) {
    return $cached['events'];
  }

  $source_url = apply_filters(
    'floridarama_synced_events_url',
    'https://novakukla.github.io/FloridaRAMA-events-calendar/events.json'
  );
  $source = floridarama_fetch_event_json( esc_url_raw( $source_url ) );

  if ( is_wp_error( $source ) ) {
    $stale = get_option( 'floridarama_synced_events_stale', array() );
    $events = is_array( $stale ) ? $stale : array();

    set_transient(
      'floridarama_synced_events',
      array( 'events' => $events ),
      5 * MINUTE_IN_SECONDS
    );

    return $events;
  }

  $events = array();
  foreach ( array_slice( $source, 0, 1000 ) as $event ) {
    $normalized = floridarama_normalize_external_event( $event, 'fareharbor' );
    if ( $normalized ) {
      $events[] = $normalized;
    }
  }

  set_transient(
    'floridarama_synced_events',
    array( 'events' => $events ),
    15 * MINUTE_IN_SECONDS
  );
  update_option( 'floridarama_synced_events_stale', $events, false );

  return $events;
}

/**
 * Return legacy manual events until the one-time WordPress import completes.
 */
function floridarama_get_legacy_manual_events() {
  $cached = get_transient( 'floridarama_legacy_manual_events' );
  if ( is_array( $cached ) && isset( $cached['events'] ) && is_array( $cached['events'] ) ) {
    return $cached['events'];
  }

  $source_url = apply_filters(
    'floridarama_legacy_manual_events_url',
    'https://novakukla.github.io/FloridaRAMA-events-calendar/manual-events.json'
  );
  $source = floridarama_fetch_event_json( esc_url_raw( $source_url ) );

  if ( is_wp_error( $source ) ) {
    $stale  = get_option( 'floridarama_legacy_manual_events_stale', array() );
    $events = is_array( $stale ) ? $stale : array();

    set_transient(
      'floridarama_legacy_manual_events',
      array( 'events' => $events ),
      5 * MINUTE_IN_SECONDS
    );

    return $events;
  }

  $events = array();
  foreach ( array_slice( $source, 0, 1000 ) as $event ) {
    $normalized = floridarama_normalize_external_event( $event, 'manual' );
    if ( $normalized ) {
      $events[] = $normalized;
    }
  }

  set_transient(
    'floridarama_legacy_manual_events',
    array( 'events' => $events ),
    15 * MINUTE_IN_SECONDS
  );
  update_option( 'floridarama_legacy_manual_events_stale', $events, false );

  return $events;
}

/**
 * Convert published WordPress event records to calendar JSON.
 */
function floridarama_get_manual_events_feed() {
  $posts = get_posts(
    array(
      'post_type'      => 'fr_event',
      'post_status'    => 'publish',
      'posts_per_page' => -1,
      'meta_key'       => 'fr_event_start',
      'orderby'        => 'meta_value',
      'order'          => 'ASC',
      'no_found_rows'  => true,
    )
  );
  $events = array();

  foreach ( $posts as $post ) {
    $post_id   = (int) $post->ID;
    $start     = floridarama_normalize_event_datetime( get_post_meta( $post_id, 'fr_event_start', true ) );
    $legacy_id = sanitize_text_field( (string) get_post_meta( $post_id, 'fr_event_legacy_id', true ) );

    if ( '' === $start ) {
      continue;
    }

    $events[] = array(
      'id'          => $legacy_id ?: 'wp-event-' . $post_id,
      'title'       => get_the_title( $post_id ),
      'start'       => $start,
      'end'         => floridarama_normalize_event_datetime( get_post_meta( $post_id, 'fr_event_end', true ) ),
      'url'         => esc_url_raw( (string) get_post_meta( $post_id, 'fr_event_url', true ) ),
      'thumbnail'   => floridarama_get_event_image_url( $post_id, 'large' ),
      'description' => trim( wp_strip_all_tags( (string) $post->post_content ) ),
      'source'      => 'manual',
    );
  }

  return $events;
}

/**
 * Merge event arrays, allowing manual events to override matching records.
 */
function floridarama_merge_calendar_events( $synced_events, $manual_events ) {
  $merged = array();

  foreach ( array_merge( $synced_events, $manual_events ) as $event ) {
    if ( ! is_array( $event ) || empty( $event['title'] ) || empty( $event['start'] ) ) {
      continue;
    }

    $id  = ! empty( $event['id'] ) ? trim( (string) $event['id'] ) : '';
    $key = $id
      ? 'id:' . $id
      : 'event:' . md5( strtolower( (string) $event['title'] ) . '|' . $event['start'] . '|' . ( $event['end'] ?? '' ) );

    $merged[ $key ] = $event;
  }

  $events = array_values( $merged );
  usort(
    $events,
    static function( $left, $right ) {
      return strcmp( (string) ( $left['start'] ?? '' ), (string) ( $right['start'] ?? '' ) );
    }
  );

  return $events;
}

/**
 * Serve the merged calendar feed.
 */
function floridarama_rest_events_feed() {
  $synced = floridarama_get_synced_events();
  $manual = floridarama_get_manual_events_feed();

  if ( ! get_option( 'floridarama_events_migration_complete', false ) ) {
    $manual = floridarama_merge_calendar_events( floridarama_get_legacy_manual_events(), $manual );
  }

  $feed   = floridarama_merge_calendar_events( $synced, $manual );

  $response = new WP_REST_Response( $feed, 200 );
  $response->header( 'Cache-Control', 'no-cache, must-revalidate' );
  $response->header( 'X-FloridaRAMA-Synced-Events', (string) count( $synced ) );
  $response->header( 'X-FloridaRAMA-Manual-Events', (string) count( $manual ) );

  return $response;
}

/**
 * Register the public calendar endpoint.
 */
function floridarama_register_events_rest_route() {
  register_rest_route(
    'floridarama/v1',
    '/events',
    array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => 'floridarama_rest_events_feed',
      'permission_callback' => '__return_true',
    )
  );
}
add_action( 'rest_api_init', 'floridarama_register_events_rest_route' );

/**
 * Find an imported manual event by its legacy JSON ID.
 */
function floridarama_find_event_by_legacy_id( $legacy_id ) {
  $posts = get_posts(
    array(
      'post_type'      => 'fr_event',
      'post_status'    => array( 'publish', 'draft', 'trash' ),
      'posts_per_page' => 1,
      'fields'         => 'ids',
      'meta_key'       => 'fr_event_legacy_id',
      'meta_value'     => $legacy_id,
      'no_found_rows'  => true,
    )
  );

  return $posts ? (int) $posts[0] : 0;
}

/**
 * Import the old manual-events.json records into WordPress.
 */
function floridarama_handle_legacy_events_import() {
  if ( ! current_user_can( 'manage_options' ) ) {
    wp_die( esc_html__( 'You are not allowed to import events.', 'floridarama' ) );
  }

  check_admin_referer( 'floridarama_import_legacy_events' );

  $source_url = apply_filters(
    'floridarama_legacy_manual_events_url',
    'https://novakukla.github.io/FloridaRAMA-events-calendar/manual-events.json'
  );
  $source = floridarama_fetch_event_json( esc_url_raw( $source_url ) );

  if ( is_wp_error( $source ) ) {
    floridarama_set_events_notice( $source->get_error_message(), 'error' );
    wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
    exit;
  }

  $created = 0;
  $updated = 0;
  $skipped = 0;

  foreach ( array_slice( $source, 0, 1000 ) as $event ) {
    $normalized = floridarama_normalize_external_event( $event, 'manual' );
    if ( ! $normalized ) {
      ++$skipped;
      continue;
    }

    $start = floridarama_normalize_event_datetime( $normalized['start'] );
    $end   = $normalized['end'] ? floridarama_normalize_event_datetime( $normalized['end'] ) : '';
    if ( '' === $start || ( $normalized['end'] && '' === $end ) ) {
      ++$skipped;
      continue;
    }

    $legacy_id = $normalized['id']
      ? $normalized['id']
      : 'legacy-' . md5( strtolower( $normalized['title'] ) . '|' . $start );
    $post_id   = floridarama_find_event_by_legacy_id( $legacy_id );
    $post_args = array(
      'post_type'    => 'fr_event',
      'post_title'   => $normalized['title'],
      'post_content' => $normalized['description'],
      'post_status'  => 'publish',
    );

    if ( $post_id > 0 ) {
      $post_args['ID'] = $post_id;
      $saved_post_id   = wp_update_post( wp_slash( $post_args ), true );
    } else {
      $saved_post_id = wp_insert_post( wp_slash( $post_args ), true );
    }

    if ( is_wp_error( $saved_post_id ) ) {
      ++$skipped;
      continue;
    }

    $saved_post_id = (int) $saved_post_id;
    update_post_meta( $saved_post_id, 'fr_event_start', $start );
    update_post_meta( $saved_post_id, 'fr_event_end', $end );
    update_post_meta( $saved_post_id, 'fr_event_url', $normalized['url'] );
    update_post_meta( $saved_post_id, 'fr_event_image_url', $normalized['thumbnail'] );
    update_post_meta( $saved_post_id, 'fr_event_legacy_id', $legacy_id );

    if ( $post_id > 0 ) {
      ++$updated;
    } else {
      ++$created;
    }
  }

  update_option( 'floridarama_events_migration_complete', 1, false );
  delete_transient( 'floridarama_legacy_manual_events' );

  floridarama_set_events_notice(
    sprintf(
      /* translators: 1: created count, 2: updated count, 3: skipped count. */
      __( 'Legacy import complete: %1$d added, %2$d updated, %3$d skipped.', 'floridarama' ),
      $created,
      $updated,
      $skipped
    )
  );

  wp_safe_redirect( admin_url( 'admin.php?page=floridarama-events' ) );
  exit;
}
add_action( 'admin_post_floridarama_import_legacy_events', 'floridarama_handle_legacy_events_import' );
