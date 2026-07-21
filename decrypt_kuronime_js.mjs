import vm from 'vm';

async function test() {
  try {
    const url = 'https://assets.animeku.org/669a0fe3-828c-4e4a-9493-feb8789c31da/kuronime.js';
    console.log(`Downloading obfuscated JS from ${url}...`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    let js = await res.text();

    const sandbox = {
      console: console,
      document: {
        getElementById: () => null,
        getElementsByTagName: () => [],
        createElement: () => ({ appendChild: () => {} }),
      },
      navigator: { userAgent: 'Mozilla/5.0' },
      window: {},
      $: () => ({ on: () => {} }),
      jQuery: () => ({ on: () => {} }),
      setInterval: () => {},
      clearInterval: () => {},
      setTimeout: () => {},
      decodedStrings: []
    };

    const decoderMatch = js.match(/function\s+(_0x[a-f0-9]+)\s*\(\s*(_0x[a-f0-9]+)\s*,\s*(_0x[a-f0-9]+)\s*\)\s*\{/);
    if (!decoderMatch) {
      console.error('Failed to locate decoder function name.');
      return;
    }
    const decoderFuncName = decoderMatch[1];

    const runCode = `
      ${js}
      
      for (let i = 0; i < 1500; i++) {
        try {
          const str = ${decoderFuncName}(i);
          if (str && typeof str === 'string') {
            decodedStrings.push({ index: i, value: str });
          }
        } catch (e) {
          // Ignore
        }
      }
    `;

    console.log('Running script in VM sandbox...');
    vm.createContext(sandbox);
    vm.runInContext(runCode, sandbox);

    console.log(`\n--- ALL DECRYPTED STRINGS (${sandbox.decodedStrings.length} found) ---`);
    sandbox.decodedStrings.forEach((item) => {
      console.log(`Index ${item.index} (0x${item.index.toString(16)}): "${item.value}"`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
