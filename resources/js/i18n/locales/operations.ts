import type { Dict } from "../translations";

export const operationsTranslations: Dict = {
  opsUnnamed: { en: "Unnamed", tl: "Walang pangalan", ceb: "Walay ngalan" },
  opsPlaceholderPlasticChairs: { en: "Plastic chairs", tl: "Mga plastik na upuan", ceb: "Mga plastik nga lingkuranan" },
  opsMetaTokenPlaceholder: { en: "From the Meta Developer Portal", tl: "Mula sa Meta Developer Portal", ceb: "Gikan sa Meta Developer Portal" },
  opsHideToken: { en: "Hide token", tl: "Itago ang token", ceb: "Itago ang token" },
  opsShowToken: { en: "Show token", tl: "Ipakita ang token", ceb: "Ipakita ang token" },
  // Event form: the venue is already taken by another event at that time.
  venueBookedTitle: { en: "This venue is already booked", tl: "Naka-book na ang lugar na ito", ceb: "Na-book na kini nga lugar" },
  venueBookedBody: {
    en: "{venue} is already used by \"{event}\" from {from} to {to}. Choose another time or place.",
    tl: "Ginagamit na ang {venue} ng \"{event}\" mula {from} hanggang {to}. Pumili ng ibang oras o lugar.",
    ceb: "Gigamit na ang {venue} sa \"{event}\" gikan {from} hangtod {to}. Pili og lain nga oras o lugar.",
  },
};
