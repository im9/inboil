#!/bin/bash
# PreToolUse hook: require user confirmation for git commit/push

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE 'git\s+(commit|push)'; then
  ACTION=$(echo "$COMMAND" | grep -q 'git.*push' && echo 'push' || echo 'commit')
  jq -n "{
    hookSpecificOutput: {
      hookEventName: \"PreToolUse\",
      permissionDecision: \"ask\",
      permissionDecisionReason: \"Git $ACTION requires your confirmation\"
    }
  }"
fi

exit 0
