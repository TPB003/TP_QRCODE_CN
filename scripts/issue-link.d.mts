export function referencedIssueNumber(body: string): number;
export function verifyIssueReference(body: string, repository: string, token: string, request?: typeof fetch): Promise<number>;
