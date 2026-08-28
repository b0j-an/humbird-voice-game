# HumBird

HumBird is a voice-controlled arcade game inspired by the one-button simplicity of Flappy Bird. Speak, sing, or make a short sound to fly; louder input creates more lift. Silence lets the bird fall.

This repository contains the working web game and a complete prompt for rebuilding it as a native Expo app for iOS and Android.

## How the controls feel

- Ordinary speech and short sounds register immediately.
- Louder vocal input produces more upward force.
- Silence reduces lift, so the bird falls naturally.
- Audio is analyzed locally in the browser and is never uploaded.
- Keyboard and pointer controls are included as fallbacks.

HumBird responds primarily to **voice power (loudness)**, not speech recognition and not a sustained musical note. That makes calls such as “ah!”, “up!”, humming, or shouting useful without requiring the player to hold one exact pitch.

## Run the web game

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal and allow microphone access.

```bash
npm test
npm run lint
npm run build
```

## Convert it to an Expo mobile app

Open [EXPO_CONVERSION_PROMPT.md](./EXPO_CONVERSION_PROMPT.md), copy the entire file, and paste it into an AI coding IDE while this repository is open. The brief is intentionally self-contained and tells the IDE to create a true native Expo application—not a WebView wrapper.

The conversion specification covers:

- Low-latency microphone analysis with `expo-audio`
- Native rendering and a deterministic 60 FPS game loop
- iOS and Android permissions and lifecycle handling
- Local high scores and accessibility fallbacks
- Rewarded ads, a remove-ads purchase, consent, and test-mode safeguards
- EAS development, preview, production, and store-submission setup
- Concrete acceptance tests and a definition of done

Core play can be developed before monetization accounts exist. Ads and in-app purchases need a native development build and real provider credentials before release; they do not run fully inside Expo Go.

## Project map

```text
app/
  page.tsx              Game UI and runtime
  game-core.ts          Pure game physics and collision logic
  game-core.test.ts     Physics tests
  voice.ts              Low-latency browser microphone analysis
  game.css              Visual system and responsive layout
public/                 Social and app artwork
EXPO_CONVERSION_PROMPT.md
```

## Responsible monetization

The mobile brief keeps monetization off by default and uses test ad IDs until release. Its recommended model is restrained: optional rewarded ads for a continue, ads only outside active play, and a one-time remove-ads entitlement. Before publishing, add a privacy policy, complete the stores’ data-safety disclosures, obtain consent where required, and verify any child-directed-content obligations for your intended audience.

## Official implementation references

- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
- [EAS Build setup](https://docs.expo.dev/build/setup/)
- [Submit to app stores](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Expo in-app purchase guide](https://docs.expo.dev/guides/in-app-purchases/)
- [React Native Google Mobile Ads](https://docs.page/invertase/react-native-google-mobile-ads)

## Originality note

HumBird uses an original name, presentation, artwork, and control system. If you publish your own version, keep its brand and assets original; do not reuse the Flappy Bird name, art, sounds, or store listing.
