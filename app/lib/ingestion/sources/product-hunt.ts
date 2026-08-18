import type { IngestedCompany, SourceConnector } from "../types";

const PH_GRAPHQL_URL = "https://api.producthunt.com/v2/api/graphql";
const PH_MAX_PAGE = 50; // API's per-request cap; no pagination loop for this MVP pass

const QUERY = `
  query FetchPosts($first: Int!, $topic: String) {
    posts(first: $first, order: VOTES, topic: $topic) {
      edges {
        node {
          name
          tagline
          description
          website
          url
          topics { edges { node { name } } }
        }
      }
    }
  }
`;

interface PhNode {
  name: string;
  tagline?: string | null;
  description?: string | null;
  website?: string | null;
  url?: string | null;
  topics?: { edges: { node: { name: string } }[] };
}

interface PhResponse {
  data?: { posts?: { edges?: { node: PhNode }[] } };
  errors?: unknown;
}

export const productHuntConnector: SourceConnector = {
  id: "product-hunt",
  label: "Product Hunt",

  get available() {
    return Boolean(process.env.PRODUCT_HUNT_API_TOKEN);
  },
  get unavailableReason() {
    return process.env.PRODUCT_HUNT_API_TOKEN ? undefined : "PRODUCT_HUNT_API_TOKEN is not set";
  },

  async fetch({ limit = 50, filter }): Promise<IngestedCompany[]> {
    const token = process.env.PRODUCT_HUNT_API_TOKEN;
    if (!token) throw new Error("PRODUCT_HUNT_API_TOKEN is not set");

    const res = await fetch(PH_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: QUERY,
        variables: { first: Math.min(limit, PH_MAX_PAGE), topic: filter || null },
      }),
    });
    if (!res.ok) throw new Error(`Product Hunt fetch failed: ${res.status} ${await res.text()}`);

    const json = (await res.json()) as PhResponse;
    if (json.errors) throw new Error(`Product Hunt API error: ${JSON.stringify(json.errors)}`);

    const nodes = (json.data?.posts?.edges ?? []).map((e) => e.node);

    return nodes
      .filter((n) => n.name && (n.description || n.tagline))
      .map((n) => ({
        name: n.name,
        description: n.description || n.tagline || "",
        url: n.website || n.url || null,
        source: "Product Hunt",
        region: "western" as const,
        country: null,
        categoryTags: (n.topics?.edges ?? []).map((e) => e.node.name.toLowerCase()).slice(0, 8),
        yearFounded: null,
        companyStage: null,
        fundingStage: null,
      }));
  },
};
