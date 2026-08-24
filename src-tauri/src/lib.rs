mod commands;
mod db;
mod error;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let db = db::init(app.handle())?;
            app.manage(db);

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::db_health,
            commands::auth::setup_status,
            commands::auth::setup_first_user,
            commands::auth::login,
            commands::auth::get_user_by_id,
            commands::auth::list_users,
            commands::auth::create_user,
            commands::auth::update_user,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::members::list_members,
            commands::members::search_members,
            commands::members::get_member,
            commands::members::create_member,
            commands::members::update_member,
            commands::members::delete_member,
            commands::members::get_member_flags,
            commands::members::set_member_flag,
            commands::members::remove_member_flag,
            commands::members::save_photo,
            commands::plans::list_plans,
            commands::plans::create_plan,
            commands::plans::update_plan,
            commands::plans::delete_plan,
            commands::subscriptions::list_subscriptions,
            commands::subscriptions::list_member_subscriptions,
            commands::subscriptions::create_subscription,
            commands::subscriptions::renew_subscription,
            commands::subscriptions::freeze_subscription,
            commands::subscriptions::unfreeze_subscription,
            commands::subscriptions::cancel_subscription,
            commands::subscriptions::set_subscription_paid,
            commands::subscriptions::get_dashboard_stats,
            commands::activity::list_activity_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
