import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

export function compile() {
  const sourcePaths = fs.readdirSync('src', { recursive: true })
    .filter(file => file.endsWith('.sol'));
  const sources = Object.fromEntries(sourcePaths.map(file => {
    const name = path.join('src', file);
    return [name, { content: fs.readFileSync(name, 'utf8') }];
  }));
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources,
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  }), { import: name => {
    const resolved = name.startsWith('solady/') ? 'lib/' + name : name;
    return fs.existsSync(resolved)
      ? { contents: fs.readFileSync(resolved, 'utf8') }
      : { error: 'Missing Solidity import ' + name };
  } }));
  const errors = output.errors?.filter(item => item.severity === 'error') ?? [];
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
  return Object.assign({}, ...Object.values(output.contracts));
}
