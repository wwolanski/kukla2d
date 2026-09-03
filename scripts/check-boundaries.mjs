import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative, sep } from 'path';

const rootDir = resolve(process.env.BOUNDARY_ROOT ?? process.cwd());
const packagesDir = resolve(rootDir, 'packages');
const srcDir = resolve(rootDir, 'src');

const ALLOWED_IMPORTS = {
  '@kukla2d/math2d': [],
  '@kukla2d/contracts': [],
  '@kukla2d/document': [],
  '@kukla2d/engine': ['@kukla2d/contracts'],
  '@kukla2d/application': [],
  '@kukla2d/platform-browser': ['@kukla2d/contracts'],
  '@kukla2d/adapter-kk2d': [],
  '@kukla2d/adapter-psd': [],
  '@kukla2d/adapter-spine': [],
  '@kukla2d/adapter-live2d': [],
  '@kukla2d/adapter-phaser-atlas': [],
};

const FEATURE_DIRS = [
  'animation', 'armature', 'canvas', 'export', 'inspector',
  'layers', 'load', 'parameters', 'physics', 'preferences',
  'projects', 'rigging', 'save', 'timeline', 'workspace', 'modular-sprite',
];
const FEATURE_INTERNAL_SEGMENTS = ['application', 'domain', 'infrastructure', 'components'];

const errors = [];

function checkPackage(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    return;
  }

  const pkgName = pkgJson.name;
  if (!pkgName || !pkgName.startsWith('@kukla2d/')) return;

  const allowed = ALLOWED_IMPORTS[pkgName];
  if (!allowed) return;

  function checkFile(filePath) {
    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }

    const importRegex = /from\s+['"](@kukla2d\/[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importedPackage = match[1];
      if (!allowed.includes(importedPackage)) {
        errors.push({
          file: relative(rootDir, filePath),
          package: pkgName,
          imported: importedPackage,
          allowed,
        });
      }
    }
  }

  function walkDir(dir) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.js') || entry.endsWith('.jsx')) {
        checkFile(fullPath);
      }
    }
  }

  walkDir(join(pkgDir, 'src'));
}

function walkPackages(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'src' || entry === 'node_modules') continue;
      if (entry === 'adapters') {
        walkPackages(fullPath);
      } else {
        checkPackage(fullPath);
      }
    }
  }
}

function walkSrc(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      out.push(...walkSrc(fullPath));
    } else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry)) {
      out.push(fullPath);
    }
  }
  return out;
}

function featureOwnerForFile(file) {
  const parts = relative(join(srcDir, 'features'), file).split('/');
  return FEATURE_DIRS.includes(parts[0]) ? parts[0] : null;
}

function isAppModalLazyImport(file, src, spec) {
  if (!file.startsWith(join(srcDir, 'app'))) return false;
  const importOffset = [
    src.indexOf(`import('${spec}')`),
    src.indexOf(`import(\"${spec}\")`),
  ].find((offset) => offset >= 0);
  if (importOffset === undefined) return false;

  const beforeImport = src.slice(0, importOffset);
  if (beforeImport.lastIndexOf('React.lazy(') > beforeImport.lastIndexOf(');')) return true;

  const escapedSpecifier = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loaderMatch = src.match(new RegExp(
    `function\\s+(\\w+)\\s*\\(\\)\\s*\\{[\\s\\S]*?import\\(\\s*['\"]${escapedSpecifier}['\"]`,
  ));
  if (!loaderMatch) return false;
  const loaderName = loaderMatch[1];
  return new RegExp(`(?:React\\.)?lazy\\(\\s*${loaderName}\\s*\\)`).test(src);
}

function checkFeatureInternalImport(file, src, spec) {
  const match = spec.match(/^@\/features\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (!match) return;

  const [, owner, segment] = match;
  if (!FEATURE_DIRS.includes(owner) || !FEATURE_INTERNAL_SEGMENTS.includes(segment)) return;
  if (featureOwnerForFile(file) === owner) return;
  if (segment === 'components' && isAppModalLazyImport(file, src, spec)) return;

  errors.push({
    file: relative(rootDir, file),
    rule: 'feature/internal',
    imported: spec,
    owner,
    message: `${relative(rootDir, file)} imports feature ${owner} internals: ${spec}; use @/features/${owner}`,
  });
}

function checkAppFeatureBoundaries() {
  const importRegex = /(?:import\s+[^;]+?\sfrom\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g;
  const appDir = join(srcDir, 'app');

  const appFiles = walkSrc(appDir);
  for (const file of appFiles) {
    let src;
    try {
      src = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    let m;
    importRegex.lastIndex = 0;
    while ((m = importRegex.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith('@/components/')) continue;
      const rest = spec.slice('@/components/'.length);
      const featureName = rest.split('/')[0];
      if (featureName === 'ui') continue;
      if (FEATURE_DIRS.includes(featureName)) {
        errors.push({
          file: relative(rootDir, file),
          rule: 'app/feature',
          imported: spec,
          message: `src/app/** cannot import @/components/${featureName}; use @/features/${featureName}`,
        });
      }
    }
  }

  for (const file of walkSrc(srcDir)) {
    let src;
    try {
      src = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    let m;
    importRegex.lastIndex = 0;
    while ((m = importRegex.exec(src))) {
      checkFeatureInternalImport(file, src, m[1]);
    }
  }

  for (const feature of FEATURE_DIRS) {
    const featureComponentsDir = join(srcDir, 'features', feature, 'components');
    const featureFiles = walkSrc(featureComponentsDir);
    for (const file of featureFiles) {
      let src;
      try {
        src = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      let m;
      importRegex.lastIndex = 0;
      while ((m = importRegex.exec(src))) {
        const spec = m[1];
        if (!spec.startsWith('@/components/')) continue;
        const rest = spec.slice('@/components/'.length);
        const targetName = rest.split('/')[0];
        if (targetName === 'ui') continue;
        if (FEATURE_DIRS.includes(targetName)) {
          errors.push({
            file: relative(rootDir, file),
            rule: 'feature/feature',
            imported: spec,
            message: `src/features/${feature}/components/** cannot import @/components/${targetName}; use @/features/${targetName}`,
          });
        }
      }
    }
  }
}

const DOMAIN_FORBIDDEN_IMPORTS = [
  /^react(\/|$)/,
  /^zustand(\/|$)/,
  /^xstate(\/|$)/,
  /^@xstate\//,
  /^@\/components\//,
  /^@\/hooks\//,
  /^@\/store\//,
  /^pixi\.js(\/|$)/,
  /^@pixi\//,
  /^lucide-react$/,
];

const DOMAIN_FORBIDDEN_GLOBALS_RE = /\b(window|document|Worker|Image)\b/g;

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function checkDomainPurity() {
  const domainFiles = walkSrc(srcDir).filter(f => f.includes(`${sep}domain${sep}`) || f.endsWith(`${sep}domain`));
  const importRegex = /(?:import\s+[^;]+?\sfrom\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g;

  for (const file of domainFiles) {
    let src;
    try {
      src = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    let m;
    importRegex.lastIndex = 0;
    while ((m = importRegex.exec(src))) {
      const spec = m[1];
      for (const pattern of DOMAIN_FORBIDDEN_IMPORTS) {
        if (pattern.test(spec)) {
          errors.push({
            file: relative(rootDir, file),
            rule: 'domain/purity',
            imported: spec,
            message: `${relative(rootDir, file)} domain imports forbidden ${spec}; domain must not depend on React, Zustand, XState, DOM, UI, or Pixi`,
          });
          break;
        }
      }
    }

    const stripped = stripCommentsAndStrings(src);
    let globalMatch;
    DOMAIN_FORBIDDEN_GLOBALS_RE.lastIndex = 0;
    while ((globalMatch = DOMAIN_FORBIDDEN_GLOBALS_RE.exec(stripped))) {
      errors.push({
        file: relative(rootDir, file),
        rule: 'domain/purity',
        imported: globalMatch[1],
        message: `${relative(rootDir, file)} domain uses forbidden global ${globalMatch[1]}; move DOM/browser access to infrastructure or application`,
      });
    }
  }
}

walkPackages(packagesDir);
checkAppFeatureBoundaries();
checkDomainPurity();

if (errors.length > 0) {
  console.error('Boundary violations found:');
  for (const err of errors) {
    if (err.rule) {
      console.error(`  ${err.file}: ${err.message}`);
    } else {
      console.error(`  ${err.file}: ${err.package} imports ${err.imported} (allowed: ${err.allowed.join(', ') || 'none'})`);
    }
  }
  process.exit(1);
} else {
  console.log('All package boundaries OK');
}
