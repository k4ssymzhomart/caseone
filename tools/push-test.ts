// Sends a test push through the Expo push service (Android over FCM V1).
//   npm run push:test -- <ExponentPushToken[...]> [--emergency]
// The iOS Simulator cannot receive remote pushes; use `xcrun simctl push booted kz.rota.app tools/push/emergency.apns`.
const args = process.argv.slice(2);
const token = args.find((a) => a.startsWith('ExponentPushToken[') || a.startsWith('ExpoPushToken['));
const emergency = args.includes('--emergency');

if (!token) {
  console.error('Usage: npm run push:test -- <ExponentPushToken[...]> [--emergency]');
  process.exit(1);
}

const message = emergency
  ? {
      to: token,
      title: 'Аварийный наряд №148',
      body: 'АВАРИЙНЫЙ наряд №148. Насос НШ-32 маслостанции, Участок обогащения. Требует ответа.',
      data: { url: '/emergency/demo', kind: 'emergency' },
      channelId: 'emergency',
      sound: 'siren.wav',
      priority: 'high',
      categoryId: 'order_actions',
    }
  : {
      to: token,
      title: 'Новый наряд №147',
      body: 'Новый наряд №147. Конвейер К-1, Участок дробления. Срок до 14:30. Приоритет: высокий.',
      data: { url: '/order/demo', kind: 'new_order' },
      channelId: 'orders',
      sound: 'ding.wav',
      priority: 'high',
      categoryId: 'order_actions',
    };

const res = await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(message),
});
const json: unknown = await res.json();
console.log(res.status, JSON.stringify(json, null, 2));
if (!res.ok) process.exit(1);

export {};
