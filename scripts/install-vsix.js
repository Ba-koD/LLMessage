const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);

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
    const pathFlags = new Set(['--install-extension']);
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

runCode([
  '--install-extension',
  vsixPath,
  '--force',
]);

console.log(`Installed extension from VSIX: ${vsixName}`);
