# User Scripts

This directory contains client-side scripts that can be executed from the Scripts page in Jellyfin Web.

## How to Write a Script

Each script should be a TypeScript/JavaScript file that exports a default object with the following structure:

```typescript
export default {
    name: 'Script Name',
    description: 'A brief description of what the script does',
    execute: async (api, log) => {
        // Your script code here
        log('Script is running...');
        
        // You have access to:
        // - api: The Jellyfin API client
        // - log: A function to output messages to the console
        
        log('Script completed!');
    }
};
```

## Script Properties

- **name** (string): The display name of the script
- **description** (string): A description shown in the UI
- **execute** (function): The main script function
  - **Parameters:**
    - `api`: The Jellyfin API client instance
    - `log`: Function to output messages to the script console
  - **Returns:** Promise<void> or void

## Message Prefixes

To make your console output easier to read and styled with colors, use these prefixes:

- `S:` - Success messages (displayed in green)
- `E:` - Error messages (displayed in red)
- `W:` - Warning messages (displayed in orange)
- `I:` - Info messages (displayed in blue)
- No prefix - Default light gray text

Example:
```typescript
log('I: Starting operation...');
log('S: Operation completed successfully!');
log('E: Failed to connect to server');
log('W: This operation may take a while');
```

## Build Time Compilation

Scripts are discovered and compiled at build time using Webpack's `require.context` feature. This means:

1. Scripts must be placed in this directory (`src/scripts/userScripts/`)
2. Scripts must have a `.ts`, `.tsx`, `.js`, or `.jsx` extension
3. Scripts are bundled with the application and loaded immediately
4. No file system access is required at runtime
5. Scripts are compatible with all build targets (web, electron, etc.)

## Examples

See the example scripts in this directory for common use cases:
- `exampleHelloWorld.ts` - Basic script structure
- `exampleListItems.ts` - Fetch and display library items
- `exampleCleanup.ts` - Perform cleanup tasks

## Security

⚠️ **Important**: Scripts have full access to the Jellyfin API with the current user's permissions. Only create scripts you trust and understand.

Scripts can only be accessed and executed by administrator users.

## Tips

- Use `async/await` for API calls
- Call `log()` frequently to provide feedback
- Handle errors gracefully with try/catch
- Test scripts thoroughly before deploying
