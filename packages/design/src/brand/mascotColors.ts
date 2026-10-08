// Mascot layer colors by appearance, from the table in Rota's brand/README.md.
import { primitives } from '../generated/tokens';
import type { MascotLayerRole } from './mascots';

const red500 = primitives['red/500'];
const red600 = primitives['red/600'];
const ink900 = primitives['ink/900'];
const white = primitives.white;
const black = primitives.black;

export const mascotColors: Record<'light' | 'dark', Record<MascotLayerRole, string>> = {
  light: {
    body: red500,
    shade: red600,
    eyes: white,
    props: white,
    ink: ink900,
    ledge: ink900,
    marks: ink900,
    balls: ink900,
    prop: ink900,
    propDetail: white,
  },
  dark: {
    body: red500,
    shade: red600,
    eyes: white,
    props: white,
    ink: ink900,
    ledge: ink900,
    marks: white,
    balls: white,
    prop: white,
    propDetail: black,
  },
};
