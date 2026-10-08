import { Redirect } from 'expo-router';

/** The «Выдать» tab never shows: the tab bar opens /create instead. A direct visit redirects there. */
export default function Issue() {
  return <Redirect href="/create" />;
}
