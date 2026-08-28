# Copy/paste prompt: convert HumBird into a monetizable Expo app

You are a senior React Native and Expo engineer. The repository currently open in this AI IDE contains a finished browser game called **HumBird**. Convert it into a production-ready native Expo application for iOS and Android.

Complete the implementation, run the available checks, and leave the project ready for a developer to insert store and monetization credentials. Do not stop at a plan. Do not wrap the website in a WebView. Preserve the existing web app unless the workspace owner explicitly asks you to replace it; create the mobile app in a new `mobile/` directory.

## Product definition

HumBird is a portrait arcade game. The player controls a flying bird with live microphone input:

- A short spoken sound such as “ah!”, ordinary speech, humming, or a shout must register; the player must not hold a perfectly steady tone.
- Louder input means more lift. Silence means gravity wins.
- React to voice energy rather than recognizing words.
- Target an input-to-physics latency of 75 ms or less on a typical physical phone.
- Do not require pitch tracking for the first release. Structure the audio module so a future pitch influence can be added, but loudness/voice power is the authoritative control signal.
- Never upload, save, transcribe, or retain microphone audio.

The web source is the behavioral and visual reference. Port the pure physics and collision rules from `app/game-core.ts`, the control behavior from `app/voice.ts`, and the visual language from `app/game.css` and `app/page.tsx`.

## Technical baseline

1. Create `mobile/` using the latest stable Expo SDK and its TypeScript/Expo Router template. SDK 57 is current at the time this brief was written; prefer the latest mutually compatible versions reported by `npx expo install` rather than forcing stale package versions.
2. Use strict TypeScript and functional React components.
3. Install native dependencies with `npx expo install`:
   - `expo-audio`
   - `@shopify/react-native-skia`
   - `@react-native-async-storage/async-storage`
   - `expo-haptics`
   - any Expo Router dependencies required by the selected template
4. Use `expo-audio`, not deprecated `expo-av`.
5. Use Skia for the playfield and React Native views for menus, HUD, dialogs, and accessibility controls.
6. Lock the app to portrait. Support safe areas, common phone aspect ratios, and both iOS and Android.

## Required architecture

Create a maintainable structure equivalent to:

```text
mobile/
  app/
    _layout.tsx
    index.tsx
  src/
    audio/
      voicePower.ts
      useVoiceControl.ts
    game/
      core.ts
      constants.ts
      types.ts
      useGameLoop.ts
    components/
      GameCanvas.tsx
      Hud.tsx
      VoiceMeter.tsx
      PermissionCard.tsx
      GameOverCard.tsx
      MonetizationGate.tsx
    monetization/
      config.ts
      ads.ts
      purchases.ts
      consent.ts
    storage/
      highScore.ts
  assets/
  app.config.ts
  eas.json
  .env.example
  README.md
```

Keep physics in pure TypeScript with no React Native imports. Add unit tests for it. The game loop must use a fixed or clamped timestep and must not tie physics correctness to React render frequency. Keep rapidly changing game state out of React state where appropriate.

## Microphone control implementation

Request recording permission only after the player presses an explicit “Enable microphone” button. Explain why access is needed before showing the OS prompt. If access is denied, show retry instructions and enable touch control.

Prefer the installed `expo-audio` SDK’s real-time microphone stream API (`useAudioStream`) so PCM frames can be analyzed without creating recordings. Inspect the installed SDK’s TypeScript definitions and official documentation and use its exact current listener/callback shape. If real-time streaming is unavailable on the installed compatible SDK, use `useAudioRecorder` with metering enabled and poll `useAudioRecorderState` every 16–33 ms. Do not downgrade to `expo-av`.

For PCM samples, calculate voice power like this:

```ts
rms = sqrt(sum(sample * sample) / sampleCount)
rawPower = clamp(
  (log10(max(rms, 0.000001)) - log10(0.01)) /
  (log10(0.14) - log10(0.01)),
  0,
  1
)
```

If the fallback API returns decibel metering, normalize roughly from `-50 dB` (quiet) to `-8 dB` (loud), then clamp to `0...1`. Make the quiet and loud thresholds configurable.

Apply a responsive envelope:

```ts
smoothed = rawPower > previous
  ? previous + (rawPower - previous) * 0.62 // fast attack
  : previous + (rawPower - previous) * 0.28 // controlled release
```

Add a small configurable noise gate based on a short ambient sample, but do not make the player perform a long calibration. Do not force continuous sound. A brief syllable must cause an immediate lift impulse/envelope, and a louder syllable must create measurably more lift.

Process audio locally. Stop the stream when the screen unmounts, permission is revoked, or the app becomes inactive/backgrounded. Resume safely only after returning to the foreground. Never write audio to persistent storage. If the fallback recorder creates a temporary file, delete it as soon as it is no longer needed.

## Physics and game behavior

Port the existing rules instead of inventing unrelated gameplay. The normalized voice power controls vertical acceleration:

```ts
verticalAcceleration = gravity * (1 - 2 * voicePower)
```

Therefore:

- `voicePower = 0`: full downward gravity
- `voicePower = 0.5`: approximately hover
- `voicePower = 1`: strong upward acceleration

Clamp velocity to fair limits and preserve smooth momentum. Generate pipe pairs with reachable gaps, score after passing a pair, increase difficulty gradually, and detect pipe/ground/ceiling collisions deterministically. Store best score with AsyncStorage. Pause gameplay when the app loses focus.

Support these states: intro, microphone explanation, permission pending, ready, 3-2-1 countdown, playing, paused, game over, and microphone error. Provide touch-and-hold control as an accessibility and simulator fallback. Haptics should be subtle and must respect the user’s device settings.

## Visual and interaction requirements

- Match the repository’s original HumBird identity, palette, bird, skyline, pipes, typography mood, voice meter, and score presentation.
- Recreate artwork as native vector/Skia shapes or use the repository’s original assets. Do not use copyrighted Flappy Bird art, audio, title, or store metadata.
- Keep active gameplay uncluttered. The live voice meter may be visible but must not cover the playfield.
- Add reduced-motion and sound/haptics settings where applicable.
- Every essential action must have an accessible label, and menus must work with screen readers.

## Monetization implementation

Build monetization behind adapters so the core game runs when all providers are disabled:

```text
EXPO_PUBLIC_MONETIZATION_MODE=off|test|production
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=
EXPO_PUBLIC_ADMOB_IOS_APP_ID=
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
```

Use `react-native-google-mobile-ads` for ads and `react-native-purchases`/RevenueCat for a one-time or lifetime **Remove Ads** entitlement. Follow each package’s current Expo config-plugin instructions. These packages require a custom development build; do not claim that full monetization works in Expo Go.

Rules:

- Monetization is `off` by default.
- Test mode uses only official test ad unit IDs.
- Never commit real IDs, API keys, or service-account credentials.
- Never show an ad during active flight.
- Offer at most one optional rewarded ad after a collision to continue once per run.
- Banner or interstitial placement is allowed only on the menu or game-over flow and must not cause accidental taps.
- The Remove Ads entitlement suppresses banner/interstitial ads. Decide explicitly whether rewarded continues remain voluntarily available and explain that choice in the mobile README.
- Add a consent gate before initializing ad SDKs. Account for Google UMP requirements, iOS tracking authorization where applicable, privacy policy access, and store data-safety/privacy disclosures.
- If dependencies or credentials are absent, adapters must return safe no-op results and the game must remain fully playable.

Do not fabricate live product identifiers. Put human-owned setup tasks in `mobile/README.md`, including AdMob app/unit creation, RevenueCat entitlement/product mapping, App Store Connect/Play Console product creation, privacy policy URL, and regional consent testing.

## Expo and EAS configuration

Create `app.config.ts` with typed environment handling and placeholder identifiers such as `com.yourstudio.humbird`; clearly mark identifiers the owner must change before the first store build. Add meaningful microphone permission text for both platforms.

Create `eas.json` profiles:

- `development`: development client and internal distribution
- `preview`: internal test build
- `production`: store build with version auto-increment where suitable

Document these commands in `mobile/README.md`:

```bash
cd mobile
npm install
npx expo start
npx expo-doctor
npx expo prebuild --clean
eas build --profile development --platform all
eas build --profile preview --platform all
eas build --profile production --platform all
eas submit --platform android
eas submit --platform ios
```

Explain that microphone/game UI may be iterated with the supported Expo environment, but ads and purchases must be tested in a development build on physical iOS and Android devices. Do not run `eas submit` or publish to stores without the owner’s explicit authorization and credentials.

## Tests and definition of done

Add tests for:

- RMS and dB normalization
- noise gate, clamp, attack, and release behavior
- louder samples producing greater normalized power
- a short burst producing immediate lift without requiring sustained input
- gravity/lift mapping at power 0, 0.5, and 1
- scoring, pipe generation constraints, collisions, pause, and restart
- monetization adapters behaving safely when disabled

The conversion is complete only when:

1. TypeScript type-checks and lint/tests pass.
2. The project starts without monetization credentials.
3. A physical-device test confirms ordinary speech and brief “ah!” sounds control the bird responsively.
4. A louder sound produces stronger lift than a quiet sound.
5. Silence lets the bird fall; background app state stops microphone processing and gameplay.
6. No microphone data is saved or transmitted.
7. Touch fallback works when permission is denied.
8. Development and production EAS configuration is present and documented.
9. Ads/IAP remain disabled by default and use test identifiers outside production.
10. The mobile README lists every remaining owner-only store/account step without leaving coding TODOs.

At the end, summarize the files created, commands run, test results, physical-device checks still requiring the owner, and exact credentials/IDs the owner must supply. Do not call unfinished scaffolding “complete.”
