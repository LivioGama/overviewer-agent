#!/bin/sh
set -e

if [ -n "$KILOCODE_API_KEY" ]; then
  echo "Injecting KILOCODE_API_KEY into config..."
  CONFIG_FILE="/home/nextjs/.kilocode/cli/config.json"
  
  cat > "$CONFIG_FILE" <<EOF
{
  "version": "1.0.0",
  "mode": "code",
  "telemetry": false,
  "provider": "default",
  "providers": [
    {
      "id": "default",
      "provider": "kilocode",
      "kilocodeToken": "$KILOCODE_API_KEY",
      "kilocodeModel": "x-ai/grok-code-fast-1"
    }
  ],
  "autoApproval": {
    "enabled": true,
    "read": {
      "enabled": true,
      "outside": true
    },
    "write": {
      "enabled": true,
      "outside": true,
      "protected": false
    },
    "browser": {
      "enabled": false
    },
    "retry": {
      "enabled": false,
      "delay": 10
    },
    "mcp": {
      "enabled": true
    },
    "mode": {
      "enabled": true
    },
    "subtasks": {
      "enabled": true
    },
    "execute": {
      "enabled": true,
      "allowed": [
        "ls",
        "cat",
        "echo",
        "pwd",
        "git",
        "bun"
      ],
      "denied": [
        "rm -rf",
        "sudo rm",
        "mkfs",
        "dd if="
      ]
    },
    "question": {
      "enabled": false,
      "timeout": 60
    },
    "todo": {
      "enabled": true
    }
  },
  "theme": "dark",
  "customThemes": {}
}
EOF
  
  chown nextjs:nodejs "$CONFIG_FILE"
  echo "Config updated successfully"
fi

exec "$@"







