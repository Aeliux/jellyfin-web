export declare global {
    import { ApiClient, Events } from 'jellyfin-apiclient';

    interface Window {
        ApiClient: ApiClient;
        Events: Events;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        NativeShell: any;
        Loading: {
            show();
            hide();
        }
    }

    interface DocumentEventMap {
        'viewshow': CustomEvent;
    }

    interface WebpackRequireContext {
        keys(): string[];
        (id: string): any;
        <T>(id: string): T;
        resolve(id: string): string;
        id: string;
    }

    interface NodeRequire {
        context(
            directory: string,
            useSubdirectories?: boolean,
            regExp?: RegExp,
            mode?: 'sync' | 'eager' | 'weak' | 'lazy' | 'lazy-once'
        ): WebpackRequireContext;
    }

    const __COMMIT_SHA__: string;
    const __JF_BUILD_VERSION__: string;
    const __PACKAGE_JSON_NAME__: string;
    const __PACKAGE_JSON_VERSION__: string;
    const __USE_SYSTEM_FONTS__: boolean;
    const __WEBPACK_SERVE__: boolean;
}
