const MAX_LINES = 200;
const VISIBLE_LINES = 12;

let enabled = false;
let visible = false;
let lines: string[] = [];

const containerEl = () => document.getElementById('dev-console')!;
const outputEl = () => document.getElementById('dev-console-output')!;
const inputEl = () => document.getElementById('dev-console-input')! as HTMLInputElement;

export type CommandHandler = (args: string) => string | void;
const commands = new Map<string, CommandHandler>();

export function isDevConsoleEnabled(): boolean {
  return enabled;
}

export function setDevConsoleEnabled(on: boolean): void {
  enabled = on;
  if (!on && visible) {
    hideDevConsole();
  }
}

export function isDevConsoleVisible(): boolean {
  return visible;
}

export function toggleDevConsole(): void {
  if (!enabled) return;
  if (visible) {
    hideDevConsole();
  } else {
    showDevConsole();
  }
}

function showDevConsole(): void {
  visible = true;
  containerEl().classList.remove('hidden');
  inputEl().focus();
}

function hideDevConsole(): void {
  visible = false;
  containerEl().classList.add('hidden');
  inputEl().blur();
}

export function logToConsole(msg: string): void {
  lines.push(msg);
  if (lines.length > MAX_LINES) {
    lines = lines.slice(lines.length - MAX_LINES);
  }
  if (visible) {
    renderOutput();
  }
}

function renderOutput(): void {
  const el = outputEl();
  const display = lines.slice(-VISIBLE_LINES);
  el.textContent = display.join('\n');
  el.scrollTop = el.scrollHeight;
}

export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name.toLowerCase(), handler);
}

function executeCommand(raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;

  logToConsole(`> ${trimmed}`);

  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

  const handler = commands.get(cmd);
  if (handler) {
    const result = handler(args);
    if (result) logToConsole(result);
  } else {
    logToConsole(`Unknown command: ${cmd}. Type "help" for available commands.`);
  }
}

export function initDevConsole(): void {
  inputEl().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeCommand(inputEl().value);
      inputEl().value = '';
    }
    // Prevent tilde from being typed into the input
    if (e.key === '`') {
      e.preventDefault();
    }
    // Stop propagation so game input doesn't fire
    e.stopPropagation();
  });

  // Prevent keyup/keydown from reaching the game while console input is focused
  inputEl().addEventListener('keyup', (e) => {
    e.stopPropagation();
  });

  // Register built-in commands
  registerCommand('help', () => {
    const names = [...commands.keys()].sort().join(', ');
    return `Commands: ${names}`;
  });

  registerCommand('clear', () => {
    lines = [];
    renderOutput();
  });
}
