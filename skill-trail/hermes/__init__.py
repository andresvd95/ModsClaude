"""skill-trail para Hermes Agent: registra cada skill que se carga y añade /skilltrail.

Escribe en el mismo historial que Claude Code y Codex (~/.skill-trail/trail.jsonl),
así que el panel de cualquiera de los tres muestra lo usado en los demás.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

HOME = Path(os.environ.get("SKILL_TRAIL_HOME") or Path.home() / ".skill-trail")
TRAIL = HOME / "trail.jsonl"
CLI = HOME / "bin" / "skill-trail.mjs"
DEDUPE_S = 120


def _project() -> str:
    cwd = os.environ.get("TERMINAL_CWD") or os.getcwd()
    return os.path.abspath(cwd).replace("\\", "/").rstrip("/").lower()


def _hermes_home() -> Path:
    env = os.environ.get("HERMES_HOME")
    return Path(env) if env else Path.home() / ".hermes"


def _pack_of(name: str) -> str | None:
    # Hermes agrupa skills por categoría: skills/<categoría>/<skill>/SKILL.md
    root = _hermes_home() / "skills"
    try:
        for hit in root.glob(f"*/{name}/SKILL.md"):
            return hit.parent.parent.name
    except OSError:
        pass
    return None


def _is_skill(name: str) -> bool:
    root = _hermes_home() / "skills"
    try:
        return (root / name / "SKILL.md").exists() or any(root.glob(f"*/{name}/SKILL.md"))
    except OSError:
        return False


def _record(skill: str, via: str, session: Any = None) -> None:
    try:
        HOME.mkdir(parents=True, exist_ok=True)
        now = int(time.time() * 1000)
        project = _project()
        try:
            tail = TRAIL.read_text(encoding="utf-8").splitlines()[-30:]
        except OSError:
            tail = []
        for line in tail:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if (e.get("agent"), e.get("project"), e.get("skill")) == ("hermes", project, skill) and now - e.get("at", 0) < DEDUPE_S * 1000:
                return
        entry = {"at": now, "agent": "hermes", "project": project, "skill": skill, "via": via}
        pack = _pack_of(skill)
        if pack:
            entry["pack"] = pack
        if session:
            entry["session"] = str(session)
        with TRAIL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:  # un hook de estado nunca rompe al agente
        pass


def _post_tool_call(**kwargs: Any) -> None:
    if kwargs.get("tool_name") != "skill_view":
        return
    args = kwargs.get("args") or {}
    name = args.get("name") if isinstance(args, dict) else None
    file_path = (args.get("file_path") if isinstance(args, dict) else None) or "SKILL.md"
    if name and file_path.endswith("SKILL.md"):
        _record(str(name), "skill_view", kwargs.get("session_id"))


_SLASH = re.compile(r"^/([A-Za-z0-9][\w.-]*)")


def _pre_llm_call(**kwargs: Any) -> None:
    msg = kwargs.get("user_message")
    if not isinstance(msg, str):
        return
    m = _SLASH.match(msg.strip())
    if m and _is_skill(m.group(1)):
        _record(m.group(1), "/comando", kwargs.get("session_id"))


def _command(raw_args: str = "") -> str:
    node = shutil.which("node")
    if not node or not CLI.exists():
        return "skill-trail: falta Node o el CLI (corre `node skill-trail/cli/skill-trail.mjs install`)."
    args = raw_args.split() if raw_args and raw_args.strip() else ["show", "--n", "15"]
    try:
        out = subprocess.run(
            [node, str(CLI), *args, "--project", _project()],
            capture_output=True, text=True, timeout=10,
            env={**os.environ, "NO_COLOR": "1"},
        )
        return (out.stdout or out.stderr).strip()
    except Exception as err:  # noqa: BLE001
        return f"skill-trail: {err}"


def register(ctx: Any) -> None:
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("pre_llm_call", _pre_llm_call)
    ctx.register_command(
        "skilltrail", _command,
        description="Historial de skills y skill grande activa (fijar <x> | soltar | limpiar)",
        args_hint="[show|fijar <x>|soltar|limpiar]",
    )
