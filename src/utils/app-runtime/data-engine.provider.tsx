import { ReactNode } from 'react';
import { useDataEngine } from '@dhis2/app-runtime';
import { DataEngineInitializer } from './dhis2-provider';

/**
 * React provider component that initializes the global data engine
 * Must be wrapped around the app
 */
export const DataEngineProvider = ({ children }: { children: ReactNode }) => {
    const engine = useDataEngine();

    return (
        <div>
            <DataEngineInitializer engine={engine} />
            {children}
        </div>
    );
};
