/**
 * Builds a user-facing help string for Notion connection errors.
 * Verbatim port of Python `notion_manager.py:169-217`.
 *
 * Branches by error code/message keyword:
 *   - `object_not_found` / "could not find database" → DB-sharing instructions
 *   - `unauthorized`                                 → token reset instructions
 *   - else                                            → generic 3-step checklist
 *
 * Returned string contains emoji glyphs by design — surfaced to humans only.
 */

export function buildConnectionErrorHelp(errorCode: string, errorMsg: string): string {
    const lowerCode = errorCode.toLowerCase();
    const lowerMsg = errorMsg.toLowerCase();

    let base = "\n\n❌ Could not connect to Notion database\n";
    base += `Error: ${errorMsg}\n\n`;
    base += "🔧 Troubleshooting Steps:\n\n";

    const isNotFound =
        lowerCode.includes("object_not_found") ||
        lowerMsg.includes("object_not_found") ||
        lowerMsg.includes("could not find database");
    const isUnauthorized = lowerCode.includes("unauthorized") || lowerMsg.includes("unauthorized");

    if (isNotFound) {
        base += "1. ✓ Make sure the database is SHARED with your integration:\n";
        base += "   • Open your Notion database\n";
        base += "   • Click '...' (three dots) in the top right\n";
        base += "   • Select 'Add connections'\n";
        base += "   • Find and add your integration\n\n";

        base += "2. ✓ Verify the database ID is correct:\n";
        base += "   • Get it from the database URL: https://notion.so/YOUR-ID-HERE?v=...\n";
        base += "   • The ID is the part between notion.so/ and ?v=\n\n";
    } else if (isUnauthorized) {
        base += "1. ✓ Check your integration token:\n";
        base += "   • Go to https://www.notion.so/my-integrations\n";
        base += "   • Make sure your integration is active\n";
        base += "   • Regenerate the 'Internal Integration Token' if needed\n";
        base += "   • Copy the latest token\n\n";

        base += "2. ✓ Update your configuration with the new token\n\n";
    } else {
        base += "1. ✓ Verify database sharing (most common issue):\n";
        base += "   • Open the database in Notion\n";
        base += "   • Click 'Share' button\n";
        base += "   • Select 'Add connections'\n";
        base += "   • Add your integration to the database\n\n";

        base += "2. ✓ Check integration token:\n";
        base += "   • Visit: https://www.notion.so/my-integrations\n";
        base += "   • Verify the token is correct or regenerate it\n\n";

        base += "3. ✓ Verify database ID:\n";
        base += "   • Get from URL: https://notion.so/[DATABASE-ID]?v=...\n\n";
    }

    base += "📖 Full Setup Guide:\n";
    base += "   https://github.com/beyourahi/extract_usernames#notion-integration\n";

    return base;
}
