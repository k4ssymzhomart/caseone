// Postinstall fixes for native code in node_modules. Idempotent; each patch documents why.
//
// 1. expo-modules-jsi 57.1.x annotates the RuntimeScheduler constructors with SWIFT_RETURNS_RETAINED
//    (expo/expo#49120, for Xcode 27). Swift 6.2 (Xcode 26.3) rejects that annotation on constructors:
//    "'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or SWIFT_RETURNS_UNRETAINED
//    because it is not returning a SWIFT_SHARED_REFERENCE type". On Swift < 6.3 we drop it from the two
//    constructors only; the class keeps its SWIFT_SHARED_REFERENCE retain/release pair.
// 2. The same package builds in Swift 6 language mode, and Swift 6.2 reports its pointer captures in
//    JavaScriptRuntime.swift as errors ("sending 'resultPtr' risks causing data races"); Swift 6.3 accepts
//    them. On Swift < 6.3 the xcframework builds in Swift 5 mode, where these stay warnings, with the
//    Swift 6 features the sources rely on switched back on (bare regex literals, isolated default values).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function swiftVersion() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('xcrun', ['swift', '--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = /Swift version (\d+)\.(\d+)/.exec(out);
    return m ? [Number(m[1]), Number(m[2])] : null;
  } catch {
    return null;
  }
}

const header = resolve(
  root,
  'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h',
);
const manifest = resolve(root, 'node_modules/expo-modules-jsi/apple/Package.swift');

function patch(file, from, to, what) {
  if (!existsSync(file)) return;
  const src = readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  if (out !== src) {
    writeFileSync(file, out);
    console.log(`patch-native: ${what}`);
  }
}

const swift = swiftVersion();
if (swift && (swift[0] < 6 || (swift[0] === 6 && swift[1] < 3))) {
  const v = swift.join('.');
  patch(header, /SWIFT_RETURNS_RETAINED (RuntimeScheduler\()/g, '$1', `expo-modules-jsi constructors for Swift ${v}`);
  patch(manifest, 'swiftLanguageModes: [.v6]', 'swiftLanguageModes: [.v5]', `expo-modules-jsi Swift 5 mode for Swift ${v}`);
  patch(
    manifest,
    /\.interoperabilityMode\(\.Cxx\),\n(?!\s*\/\/ rota-swift6-features)/,
    `.interoperabilityMode(.Cxx),
        // rota-swift6-features
        .enableUpcomingFeature("BareSlashRegexLiterals"),
        .enableUpcomingFeature("IsolatedDefaultValues"),
        .enableUpcomingFeature("ConciseMagicFile"),
        .enableUpcomingFeature("ForwardTrailingClosures"),
        .enableUpcomingFeature("DisableOutwardActorInference"),
        .enableUpcomingFeature("GlobalActorIsolatedTypesUsability"),
        .enableUpcomingFeature("InferSendableFromCaptures"),
        .enableUpcomingFeature("ImplicitOpenExistentials"),
        .enableUpcomingFeature("DynamicActorIsolation"),
`,
    `expo-modules-jsi Swift 6 features in Swift 5 mode for Swift ${v}`,
  );
}
