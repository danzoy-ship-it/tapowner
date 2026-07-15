// Static, illustrative previews of each outreach template — shown when a
// template is expanded so the agent sees the gist before picking one. The real
// draft is AI-generated and personalized (email) or written to the whole list
// (letter); these are representative samples, keyed by the template id the
// server sends in config.draft.templates. Missing id => no preview shown.
export const TEMPLATE_PREVIEWS: Record<string, string> = {
  just_sold_farming:
    "Hi there — I recently helped a buyer purchase a home just around the corner from you, and I'm still working with families who'd love this neighborhood. If you've ever wondered what your home might be worth in today's market, I'd be glad to share a quick, no-obligation estimate.",
  absentee_owner:
    "Hello — I work with owners of rental and investment properties in this area, and I noticed you own a home here but live elsewhere. If you'd ever like a free look at what it's worth today, or what it could rent for, I'm happy to put one together — no pressure at all.",
  expired_listing:
    "Hi — I noticed your home was on the market recently but didn't sell. That's usually about timing or positioning, not the home itself. I'd be glad to share an honest take on what could help it sell this time, along with a free updated market analysis.",
  fsbo:
    "Hello — I saw you're selling your home on your own, and I respect that. If it's ever useful, I can show you a few specific ways I might net you more — pricing, wider marketing, and handling the negotiation and paperwork. No pressure, just an option to keep in mind.",
  open_house_neighbor_invite:
    "Hi neighbor — I'm hosting an open house nearby this weekend and wanted to invite you. Neighbors are often the first to know who'd love to move to the area, and it's a great chance to see what homes like yours are going for. Stop by if you can!",
  adjacent_lot:
    "Hello — I'm working with a buyer purchasing the property next to yours, and they're interested in the adjacent lot as well. With no pressure at all, I wanted to ask whether you'd ever consider selling it — I have a ready buyer if the timing is ever right.",
  buyer_neighborhood_match:
    "Hello — I may have a motivated, qualified buyer who recently toured a home in your neighborhood. It wasn't quite the right fit, but they fell in love with the area and asked me to find something similar. If you've ever thought about selling, I'd love to talk.",
};
