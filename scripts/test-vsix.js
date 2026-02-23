const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);
const testRoot = path.join(root, '.vscode-test');
const userDataDir = path.join(testRoot, 'user-data');
const extensionsDir = path.join(testRoot, 'extensions');

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

function runNpm(args) {
  if (process.platform === 'win32') {
    run('cmd.exe', ['/C', 'npm', ...args]);
    return;
  }

  run('npm', args);
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
    const pathFlags = new Set(['--install-extension', '--user-data-dir', '--extensions-dir']);
    const converted = args.map((arg, index) => {
      const prev = args[index - 1];
      return pathFlags.has(prev) ? toWindowsPath(arg) : arg;
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

runNpm(['run', 'package']);

if (!fs.existsSync(vsixPath)) {
  console.error(`VSIX not found: ${vsixPath}`);
  process.exit(1);
}

fs.rmSync(testRoot, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(extensionsDir, { recursive: true });

runCode([
  '--user-data-dir',
  userDataDir,
  '--extensions-dir',
  extensionsDir,
  '--install-extension',
  vsixPath,
  '--force',
]);

runCode(['--new-window', '--user-data-dir', userDataDir, '--extensions-dir', extensionsDir]);

console.log(`Installed and launched in isolated test window: ${vsixName}`);
