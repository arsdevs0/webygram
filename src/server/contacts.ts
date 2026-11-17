import type { Express } from 'express';
import { Api, helpers, type TelegramClient } from 'telegram';
export function registerContactRoutes(app: Express, deps: { client: () => TelegramClient | null; cache: Map<string, any> }) {
  app.get('/api/tg/contacts', async (_req, res) => {
    const client = deps.client();
    if (!client?.connected) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const result = await client.invoke(new Api.contacts.GetContacts({ hash: helpers.generateRandomLong(true).multiply(0) }));
      if (!(result instanceof Api.contacts.Contacts)) return res.json({ contacts: [] });
      const contactIds = new Set(result.contacts.map(contact => String(contact.userId)));
      const contacts = result.users.filter((user): user is Api.User => user instanceof Api.User && !user.deleted && !user.self && contactIds.has(String(user.id))).map(user => {
        const id = String(user.id); deps.cache.set(id, user);
        return { id, title: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Telegram contact',
          firstName: user.firstName || '', lastName: user.lastName, username: user.username, phone: user.phone,
          avatarUrl: user.photo instanceof Api.UserProfilePhoto ? '/api/tg/avatar/' + encodeURIComponent(id) : '',
          status: user.status instanceof Api.UserStatusOnline ? 'online' : user.status instanceof Api.UserStatusRecently ? 'last seen recently' : user.status instanceof Api.UserStatusLastWeek ? 'last seen within a week' : user.status instanceof Api.UserStatusLastMonth ? 'last seen within a month' : 'offline',
          isBot: Boolean(user.bot), isVerified: Boolean(user.verified), isPremium: Boolean(user.premium) };
      }).sort((a, b) => a.title.localeCompare(b.title));
      return res.json({ contacts });
    } catch (error) { return res.status(400).json({ error: (error as Error).message || 'Could not load contacts.' }); }
  });
}

