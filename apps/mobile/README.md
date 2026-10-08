# @rota/mobile

Expo SDK 57 development build (never Expo Go). Routes live in `src/app/`, the Rota mobile kit in `src/ui/`.

```sh
npm run assets        # from the repo root, before the first native build
npm run ios           # expo run:ios, builds the dev client into the iOS Simulator
npm run dev:mobile    # from the repo root, Metro for an installed dev client
npm run android       # emulator or USB phone
```

`EXPO_PUBLIC_API_MODE=mock|supabase` in `apps/mobile/.env` picks the API. See the root README.
