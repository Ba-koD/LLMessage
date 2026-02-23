const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const isWsl =
  process.platform === 'linux' &&
  fs.existsSync('/proc/version') &&
  /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: root,
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runTypeScriptCompile() {
  const tscPath = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tscPath, '-p', './']);
}

function toWindowsPath(posixPath) {
  const result = spawnSync('wslpath', ['-w', posixPath], {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status === 0) {
    return result.stdout.trim();
  }

  return posixPath;
}

function runCode(args) {
  if (isWsl) {
    const pathFlags = new Set(['--extensionDevelopmentPath']);
    const converted = args.map((arg, index) => {
      const prev = args[index - 1];
      if (pathFlags.has(prev)) {
        return toWindowsPath(arg);
      }

      if (!arg.startsWith('-') && path.isAbsolute(arg)) {
        return toWindowsPath(arg);
      }

      return arg;
    });

    run('cmd.exe', ['/C', 'code', ...converted]);
    return;
  }

  if (process.platform === 'win32') {
    run('cmd.exe', ['/C', 'code', ...args]);
    return;
  }

  run('code', args);
}

runTypeScriptCompile();

runCode([
  '--new-window',
  '--extensionDevelopmentPath',
  root,
  root,
]);

console.log('Launched Extension Development Host window from current profile context.');
