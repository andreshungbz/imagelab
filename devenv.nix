{
  pkgs,
  ...
}:
let
  # https://github.com/golang-migrate/migrate/issues/1279
  go-migrate-pg = pkgs.go-migrate.overrideAttrs (oldAttrs: {
    tags = [ "postgres" ];
  });
in
{
  # https://devenv.sh/packages/
  packages = with pkgs; [
    curl
    gawk
    git
    gnumake
    go-migrate-pg
    jq
    just
    just-lsp
  ];

  # https://devenv.sh/languages/
  languages = {
    go = {
      enable = true;
      delve.enable = true;
      lsp.enable = true;
    };

    javascript = {
      enable = true;
      npm.enable = true;
    };

    python = {
      enable = true;
      directory = "./python";
      venv.enable = true;
      uv = {
        enable = true;
        sync.enable = true;
      };
    };
  };

  # https://devenv.sh/scripts/
  scripts.version.exec = ''
    go version
    python3 --version
    uv --version
  '';

  # https://devenv.sh/basics/
  enterShell = ''
    version

    mkdir -p .vscode
    SETTINGS_FILE=".vscode/settings.json"
    if [ ! -f "$SETTINGS_FILE" ]; then
      echo "{}" > "$SETTINGS_FILE"
    fi

    jq --arg venv "$DEVENV_STATE/venv/bin/python" \
       '. + {
         "python.defaultInterpreterPath": $venv,
         "python.analysis.extraPaths": ["${"$"}{workspaceFolder}/python/src"],
         "python.analysis.typeCheckingMode": "basic"
       }' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  '';
}
