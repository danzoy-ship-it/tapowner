export interface DraftTemplate {
    id: string;
    label: string;
    goal: string;
}

export const DRAFT_TEMPLATES: DraftTemplate[] = [
    {
        id: "just_sold_farming",
        label: "Just Sold (Farming)",
        goal: "Let the owner know you recently sold a nearby home and are actively working buyers in the neighborhood, positioning yourself as the local expert in case they ever consider selling.",
    },
    {
        id: "absentee_owner",
        label: "Absentee Owner",
        goal: "The owner does not live at this property (it's likely a rental or investment). Reach out as an agent who works with investment property owners, offering a free assessment of the property's current value or rental performance.",
    },
    {
        id: "expired_listing",
        label: "Expired Listing",
        goal: "This property's listing recently expired without selling. Offer a fresh, no-pressure perspective on what might help it sell this time, and offer a free updated market analysis.",
    },
    {
        id: "fsbo",
        label: "FSBO Outreach",
        goal: "The owner is trying to sell the property themselves (For Sale By Owner). Respectfully offer to help, emphasizing the specific ways an agent can get them a better net outcome (pricing, marketing reach, negotiation, paperwork) without being pushy.",
    },
    {
        id: "open_house_neighbor_invite",
        label: "Open House Neighbor Invite",
        goal: "Invite the owner, as a neighbor, to an upcoming open house nearby, since neighbors are often curious about local home values and may know someone looking to move to the area.",
    },
];

export const DRAFT_TONES = ["professional", "friendly", "direct"] as const;
export type DraftTone = (typeof DRAFT_TONES)[number];

export interface DraftPromptInput {
    template: DraftTemplate;
    tone: DraftTone;
    agentName: string;
    agentBrokerage: string | null;
    agentPhone: string | null;
    ownerName: string | null;
    situsAddress: string | null;
    propertyDetails: string[];
}

export function buildDraftPrompt(input: DraftPromptInput): string {
    const { template, tone, agentName, agentBrokerage, agentPhone, ownerName, situsAddress, propertyDetails } = input;

    const agentLine = [agentName, agentBrokerage].filter(Boolean).join(", ");
    const detailsLine = propertyDetails.length > 0 ? propertyDetails.join(", ") : "no additional details available";

    return `You are drafting a short outreach email for a Texas real estate agent to send to a property owner. Write in a ${tone} tone.

Agent: ${agentLine}${agentPhone ? ` (${agentPhone})` : ""}
Recipient: ${ownerName ?? "the property owner"}
Property address: ${situsAddress ?? "unknown address"}
Property details: ${detailsLine}

Goal of this email: ${template.goal}

Rules:
- Address the recipient by name if given, otherwise a generic respectful greeting.
- Reference the actual property address naturally.
- Keep it under 150 words, no more than 2 short paragraphs.
- Do NOT include a sign-off, closing, or signature block (no "Best regards," no agent name/brokerage/phone at the end) -- that gets appended separately, verbatim, after your response. End the body right after the last sentence of the message itself.
- No markdown, no placeholders like [Owner Name] -- use the real values given above.
- Do not fabricate property facts beyond what's given above.

Respond with ONLY a JSON object of the exact shape {"subject": "...", "body": "..."} and nothing else -- no code fences, no commentary.`;
}
