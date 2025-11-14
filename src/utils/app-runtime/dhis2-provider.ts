import React, { ReactNode, Component } from 'react';
import { useDataEngine } from '@dhis2/app-runtime';

type DataEngine = {
    query: (config: any) => Promise<any>;
    mutate: (config: any) => Promise<any>;
};

// Global variable to hold the data engine
let globalDataEngine: DataEngine | null = null;

/**
 * Internal component that initializes the global data engine
 * This is a side-effect component that doesn't render anything visible
 */
export class DataEngineInitializer extends Component<{ engine: DataEngine }, {}> {
    componentDidMount() {
        globalDataEngine = this.props.engine;
    }

    componentDidUpdate(prevProps: { engine: DataEngine }) {
        if (prevProps.engine !== this.props.engine) {
            globalDataEngine = this.props.engine;
        }
    }

    render() {
        return null;
    }
}

/**
 * Get the global data engine
 */
export function getDataEngine(): DataEngine {
    if (!globalDataEngine) {
        throw new Error('DHIS2 app-runtime data engine not available. Make sure DataEngineProvider is wrapped around your app.');
    }
    return globalDataEngine;
}
