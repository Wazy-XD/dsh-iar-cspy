"""Stable entry point for the official IAR C-SPY MCP server.

The DeepSeek Harness bundle cannot know where each machine keeps IAR Embedded
Workbench, so the setup script writes that (and a writable temp directory) to a
per-user ``config.json``. This launcher applies those settings and then delegates
to the unmodified official server, ``iar_cspy_mcp.cli``.

Why a launcher instead of ``--iar-path`` in the bundle patch:

* the install path differs per machine and cannot be committed to a published
  package;
* the Python process must be started from a normal (Medium integrity) location.
  A virtual environment created inside a sandboxed workspace inherits a Low
  integrity label and cannot write to ``%TEMP%``, which makes CSpyServer2 fail
  with "No usable temporary directory found";
* ``TEMP``/``TMP`` are pinned to the launcher's own directory for the same
  reason.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

__version__ = "1.0.0"

CONFIG_NAME = "config.json"


def state_dir() -> Path:
    """Per-user state directory shared with the setup and doctor scripts."""
    override = os.environ.get("DSH_IAR_CSPY_HOME")
    if override:
        return Path(override).expanduser()
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return Path(local) / "dsh-iar-cspy"
    return Path.home() / ".dsh-iar-cspy"


def config_path() -> Path:
    return state_dir() / CONFIG_NAME


def load_config() -> dict:
    path = config_path()
    if not path.is_file():
        raise SystemExit(
            "dsh-iar-cspy is not set up yet: "
            f"{path} does not exist.\n"
            "Run scripts\\setup.ps1 from the dsh-iar-cspy package (or from the "
            "GitHub release) once, then reload the plugin."
        )
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"dsh-iar-cspy: cannot read {path}: {exc}") from exc
    if not isinstance(config, dict):
        raise SystemExit(f"dsh-iar-cspy: {path} must contain a JSON object")
    return config


def resolve_settings(config: dict) -> tuple[Path, Path]:
    iar_path = Path(str(config.get("iarPath") or "")).expanduser()
    if not str(iar_path) or iar_path.name == "":
        raise SystemExit("dsh-iar-cspy: config.json has no iarPath; re-run scripts\\setup.ps1")
    if not (iar_path / "common" / "bin").is_dir():
        raise SystemExit(
            f"dsh-iar-cspy: iarPath {iar_path} has no common\\bin directory; "
            "re-run scripts\\setup.ps1 with -IarPath"
        )
    temp = config.get("tempDir")
    temp_dir = Path(str(temp)).expanduser() if temp else state_dir() / "tmp"
    return iar_path, temp_dir


def apply_environment(iar_path: Path, temp_dir: Path, extra_env: dict | None = None) -> None:
    temp_dir.mkdir(parents=True, exist_ok=True)
    os.environ["IAR_INSTALL_PATH"] = str(iar_path)
    # These must point at a directory this process can write to; see the module docstring.
    os.environ["TEMP"] = str(temp_dir)
    os.environ["TMP"] = str(temp_dir)
    for key, value in (extra_env or {}).items():
        os.environ[str(key)] = str(value)


def doctor(config: dict) -> int:
    print(f"launcher: {__version__}")
    print(f"state dir: {state_dir()}")
    print(f"config:    {config_path()}")
    iar_path, temp_dir = resolve_settings(config)
    print(f"iarPath:   {iar_path}")
    print(f"tempDir:   {temp_dir}")
    probe = temp_dir / ".dsh-iar-cspy-write-test"
    try:
        temp_dir.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        print("temp write: ok")
    except OSError as exc:
        print(f"temp write: FAILED ({exc})")
        return 1
    for relative in ("common/bin/CSpyServer2.exe", "common/bin/IarServiceLauncher.exe"):
        candidate = iar_path / relative
        print(f"{relative}: {'ok' if candidate.is_file() else 'missing'}")
    try:
        import iar_cspy_mcp  # noqa: F401
        import iar_cspy  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        print(f"python packages: FAILED ({exc})")
        return 1
    print("python packages: ok")
    return 0


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    config = load_config()
    iar_path, temp_dir = resolve_settings(config)

    if "--doctor" in args:
        raise SystemExit(doctor(config))
    if "--print-config" in args:
        print(json.dumps({"iarPath": str(iar_path), "tempDir": str(temp_dir)}, indent=2))
        return

    apply_environment(iar_path, temp_dir, config.get("env") if isinstance(config.get("env"), dict) else None)

    forwarding = list(args)
    if not any(arg == "--iar-path" or arg.startswith("--iar-path=") for arg in forwarding):
        forwarding = ["--iar-path", str(iar_path), *forwarding]

    from iar_cspy_mcp.cli import main as server_main

    server_main(forwarding)


if __name__ == "__main__":
    main()
