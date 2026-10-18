## Moving servers

Moving is nothing unusual on the fediverse. It was built in from the start, and it's one of the basics.

[icon:footprints] Basics · [icon:server] Mastodon, Misskey, and more · [icon:repeat] Your followers come with you

### Why it's a basic

A fediverse address looks like `@name@server`. Just as a street address names its town, your account names its server. Servers are like towns: if one stops feeling right, changes its rules, or closes, you can move to another.

This isn't a workaround. ActivityPub has a `Move` activity that says "this account now lives over there," and it's what lets your followers follow you to the new account. So don't agonize over your first server. Live there for a while, and move if it doesn't fit.

### Move, add, or stay

Moving isn't the only answer. Plenty of people keep accounts on several servers.

- [icon:repeat] **Move** when you want everything in one account. Your followers come along.
- [icon:user-plus] **Add** another account to separate topics, languages, or communities. Link each account from the other's profile so people know they're both you.
- [icon:house] **Stay** if your current town feels like home. That's enough.

Any of these is fine. Knowing you can always move just makes picking a server a little lighter.

### What comes along, what you carry, what stays

- [icon:repeat] **Comes along:** your followers. They automatically follow the new account, gradually if there are many.
- [icon:inbox] **You carry:** the accounts you follow, lists, blocks, mutes, and blocked domains. Export them as CSV files from the old account and import them on the new one.
- [icon:notebook-pen] **Stays behind:** your posts and media. For technical reasons they can't be moved, but you can download an archive to keep. Accounts that approve followers by hand will need to approve your new account again.

### Steps

These follow Mastodon. Misskey works the same way at heart: add an alias on the new account, then start the move from the old one.

1. **Create an account on the new server.** Fill in your avatar and bio first, so followers can tell it's you.
2. **Export from the old account.** Under Preferences › Import and export, download CSVs such as your follows. You can request a post archive once every 7 days, so ask for it early if you want it.
3. **Import on the new account.** Upload those CSVs from the same menu.
4. **Add an alias on the new account.** Under Preferences › Account › "Moving from a different account", enter your old address. The new account has to confirm "that one is me too" first. Otherwise anyone could walk off with someone else's followers.
5. **Start the move from the old account.** Under Preferences › Account › "Moving to a different account", enter the new address and your password. If it says the account is "not an alias", step 4 hasn't reached the old server yet. Wait up to a day.

### Before you start

- [icon:triangle-alert] **A move can't be undone.** The old account can no longer post, and its profile shows that you've moved. Check any remaining notifications and DMs first.
- [icon:triangle-alert] **After moving, you can't move again for 30 days.**
- [icon:split] **Not sure yet? Set up a redirect instead.** On Mastodon, a redirect only shows that you've moved. It doesn't move followers, and you can cancel it at any time.
- [icon:shield-check] **Export now and then.** If a server shuts down suddenly, moving gets hard. Keeping recent CSVs around is part of the basics too.
- [icon:server] **Different software usually works.** Moving followers between Mastodon and Misskey mostly works in both directions, though it can vary by server.

:::cards
- [icon:book-open] **Mastodon's own guide** — moving, exporting, and importing — [Read the guide](https://docs.joinmastodon.org/user/moving/)
- [icon:map] **joinfediverse.kr** — for choosing your next town — [Look around](https://joinfediverse.kr)
:::
