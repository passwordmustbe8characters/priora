import { buildNewsRssConnector } from "./news-rss";

export const techpointAfricaConnector = buildNewsRssConnector(
  "techpoint-africa",
  "Techpoint Africa",
  "https://techpoint.africa/feed/",
);
