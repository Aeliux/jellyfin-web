# Scripts Feature Implementation Summary

## Overview
Successfully implemented a client-based scripting engine for Jellyfin Web with build-time compilation support.

## Changes Made

### 1. Profile Menu Addition
- **File**: [src/components/toolbar/AppUserMenu.tsx](src/components/toolbar/AppUserMenu.tsx)
- Added "Scripts" menu option (admin-only) with Code icon
- Positioned after Metadata Manager in the admin section

### 2. Route Configuration
- **Experimental App**: [src/apps/experimental/routes/asyncRoutes/user.ts](src/apps/experimental/routes/asyncRoutes/user.ts)
  - Added `/scripts` route with AppType.Experimental
- **Stable App**: [src/apps/stable/routes/asyncRoutes/user.ts](src/apps/stable/routes/asyncRoutes/user.ts)
  - Added `/scripts` route with page reference

### 3. Scripts Page Components
Created identical scripts pages for both app layouts:
- [src/apps/experimental/routes/scripts/index.tsx](src/apps/experimental/routes/scripts/index.tsx)
- [src/apps/stable/routes/scripts/index.tsx](src/apps/stable/routes/scripts/index.tsx)

**Features**:
- Auto-discovers scripts at build time using `import.meta.glob()`
- Admin-only access control
- Per-script console output with timestamps
- Run/stop controls
- Auto-scrolling console
- Terminal-style output (green text on black background)
- Clear console button

### 4. Build-Time Scripting Engine
- **Script Directory**: [src/scripts/userScripts/](src/scripts/userScripts/)
- Scripts discovered and bundled at build time
- Compatible with all build targets (web, electron, etc.)
- No runtime file system access required
- Scripts have full API access with user permissions

### 5. Type Definitions
- **File**: [src/global.d.ts](src/global.d.ts)
- Added `ImportMeta.glob` type definition for Vite build system

### 6. Example Scripts
Created three example scripts demonstrating different capabilities:

1. **exampleHelloWorld.ts** - Basic script structure
2. **exampleListItems.ts** - Fetch recent library items using Jellyfin SDK
3. **exampleServerInfo.ts** - Display server information

### 7. Documentation
- **File**: [src/scripts/userScripts/README.md](src/scripts/userScripts/README.md)
- Comprehensive guide for writing custom scripts
- API documentation
- Security notes
- Best practices

## Script Structure
```typescript
export default {
    name: 'Script Name',
    description: 'Script description',
    execute: async (api: Api, log: (message: string) => void) => {
        log('Running...');
        // Script logic here
    }
};
```

## Key Technical Details

### Build-Time Discovery
- Uses Vite's `import.meta.glob()` with `eager: true`
- Scans `/src/scripts/userScripts/*.{ts,tsx,js,jsx}`
- Scripts are compiled into the main bundle
- No dynamic imports or file system access at runtime

### Security
- Admin-only access enforced in UI
- Scripts execute with current user's API permissions
- No arbitrary code execution from external sources

### UI/UX
- Material-UI components for consistent styling
- Per-script console output
- Real-time logging with timestamps
- Auto-scrolling terminal display
- Error handling and display

## Files Created
1. `/src/components/toolbar/AppUserMenu.tsx` (modified)
2. `/src/apps/experimental/routes/asyncRoutes/user.ts` (modified)
3. `/src/apps/stable/routes/asyncRoutes/user.ts` (modified)
4. `/src/apps/experimental/routes/scripts/index.tsx` (new)
5. `/src/apps/stable/routes/scripts/index.tsx` (new)
6. `/src/scripts/userScripts/README.md` (new)
7. `/src/scripts/userScripts/exampleHelloWorld.ts` (new)
8. `/src/scripts/userScripts/exampleListItems.ts` (new)
9. `/src/scripts/userScripts/exampleServerInfo.ts` (new)
10. `/src/global.d.ts` (modified)

## Usage

### Accessing Scripts
1. Log in as an administrator
2. Click user menu (top right)
3. Select "Scripts"

### Creating New Scripts
1. Create a new `.ts` file in `/src/scripts/userScripts/`
2. Export default object with name, description, and execute function
3. Rebuild the application
4. Script will appear in the Scripts page

## All linting and TypeScript errors have been resolved.
