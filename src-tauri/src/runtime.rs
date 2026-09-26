//! Local runtime lifecycle for the desktop build.
//!
//! A browser cannot start an operating-system process, and it should not be
//! able to. In the desktop shell that restriction does not apply, so the
//! "Start local runtime" button calls straight into these commands instead of
//! going through the web fallback.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::State;

#[derive(Default)]
pub struct RuntimeProcess(pub Mutex<Option<Child>>);

#[derive(serde::Serialize)]
pub struct RuntimeStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub message: String,
}

/// Starts the FastAPI runtime via the repository's own start script, so the
/// desktop build and the command line stay in step with one another.
#[tauri::command]
pub fn start_runtime(state: State<RuntimeProcess>) -> Result<RuntimeStatus, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(child) = guard.as_mut() {
        // `try_wait` returning None means it is still alive.
        if matches!(child.try_wait(), Ok(None)) {
            return Ok(RuntimeStatus {
                running: true,
                pid: Some(child.id()),
                message: "The local runtime is already running.".into(),
            });
        }
    }

    let script = if cfg!(target_os = "windows") {
        "scripts\\start-local.bat"
    } else {
        "scripts/start-local.sh"
    };

    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", script]);
        c
    } else {
        let mut c = Command::new("bash");
        c.arg(script);
        c
    };

    let child = command
        // Runtime only: the desktop shell already serves the interface.
        .env("KOVAI_RUNTIME_ONLY", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("Could not start the local runtime: {err}"))?;

    let pid = child.id();
    *guard = Some(child);

    Ok(RuntimeStatus {
        running: true,
        pid: Some(pid),
        message: "Starting the local runtime.".into(),
    })
}

#[tauri::command]
pub fn stop_runtime(state: State<RuntimeProcess>) -> Result<RuntimeStatus, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    match guard.take() {
        Some(mut child) => {
            let _ = child.kill();
            let _ = child.wait();
            Ok(RuntimeStatus {
                running: false,
                pid: None,
                message: "The local runtime was stopped.".into(),
            })
        }
        None => Ok(RuntimeStatus {
            running: false,
            pid: None,
            message: "KOVAI did not start this runtime.".into(),
        }),
    }
}

#[tauri::command]
pub fn runtime_status(state: State<RuntimeProcess>) -> Result<RuntimeStatus, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let running = guard
        .as_mut()
        .map(|child| matches!(child.try_wait(), Ok(None)))
        .unwrap_or(false);

    Ok(RuntimeStatus {
        running,
        pid: guard.as_ref().map(|c| c.id()),
        message: if running {
            "Running".into()
        } else {
            "Not running".into()
        },
    })
}
