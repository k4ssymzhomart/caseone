// «Подключить Telegram» (CLAUDE.md §8 Telegram link): rpc telegram_link_token → deep link t.me/<bot>?start=<token>,
// valid 15 minutes; the telegram-webhook Edge Function stores the chat id. Supabase mode only.
import { Linking } from 'react-native';

import { apiMode, supabase } from '@/lib/supabase';

/** The bot's public username (not a secret), from EXPO_PUBLIC_TELEGRAM_BOT. */
export const telegramBot = process.env.EXPO_PUBLIC_TELEGRAM_BOT ?? '';

export const telegramAvailable = apiMode === 'supabase' && supabase !== null && telegramBot.length > 0;

export async function openTelegramLink(): Promise<void> {
  if (!supabase || !telegramBot) throw new Error('TELEGRAM_UNAVAILABLE');
  const { data, error } = await supabase.rpc('telegram_link_token');
  if (error || typeof data !== 'string') throw error ?? new Error('TELEGRAM_TOKEN');
  const url = `https://t.me/${telegramBot}?start=${encodeURIComponent(data)}`;
  await Linking.openURL(url);
}
