# dsh-iar-launcher

Stable launcher for the official IAR C-SPY MCP server, used by the
[`dsh-iar-cspy`](https://github.com/Wazy-XD/dsh-iar-cspy) DeepSeek Harness
bundle.

`scripts/setup.ps1` installs this package into the bundle's private virtual
environment and writes `%LOCALAPPDATA%\dsh-iar-cspy\config.json`. The bundle then
starts `python -m dsh_iar_launcher`, and the launcher:

1. applies `IAR_INSTALL_PATH` from `config.json`;
2. pins `TEMP`/`TMP` to a writable directory;
3. forwards every argument to the unmodified `iar_cspy_mcp.cli`.

The official server is not patched or replaced; this package only supplies the
machine-specific settings it cannot know.
