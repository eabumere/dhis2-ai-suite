import 'react'

declare module 'react' {
    interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
        jsx?: boolean
        global?: boolean
    }
}

interface ImportMetaEnv {
    readonly DHIS2_API_BASE_URL: string
    readonly DHIS2_USERNAME: string
    readonly DHIS2_PASSWORD: string
    readonly DHIS2_OPENAI_MODEL: string
    readonly DHIS2_AZURE_KEY: string
    readonly DHIS2_AZURE_ENDPOINT: string
    readonly DHIS2_AZURE_API_DEPLOYMENT_NAME: string
    readonly DHIS2_AZURE_API_VERSION: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
