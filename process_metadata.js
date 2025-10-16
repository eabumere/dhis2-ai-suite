// Script to process DHIS2 metadata and generate tables
const metadata = {
    "categories": [
        {
            "code": "HIV_AGE",
            "name": "HIV age",
            "id": "veGzholzPQm"
        },
        {
            "code": "HIV_PAED_AGE",
            "name": "HIV paediatric age",
            "id": "aN4inMKVhqc"
        }
    ],
    "dataEntryForms": [
        {
            "name": "HIV Peadriatic Form",
            "id": "tS6WlfUBgwg"
        }
    ],
    "indicators": [
        {
            "name": "HIV: testing and counseling 15-24y",
            "id": "sMTMkudvLCD"
        },
        {
            "name": "HIV: testing and counseling <15y",
            "id": "lI5Q5vkydYu"
        },
        {
            "name": "HIV: testing and counseling 25-49y",
            "id": "lOiynlltFdy"
        },
        {
            "name": "HIV: testing and counseling >49y",
            "id": "btgZ1oeF9pJ"
        }
    ],
    "indicatorGroups": [
        {
            "name": "HIV",
            "id": "RsvclmONCT3"
        },
        {
            "name": "HIV Care Data Export",
            "id": "uFcn6Gs8rTC"
        }
    ],
    "dataElementGroups": [
        {
            "name": "HIV/AIDS",
            "id": "HKU7L73im5r"
        },
        {
            "name": "HIV Care",
            "id": "URmi41e0SFH"
        },
        {
            "name": "HIV Peadriatics",
            "id": "ID4BbhF7Eli"
        }
    ],
    "optionSets": [
        {
            "code": "OS_HIV_RESULT",
            "name": "HIV Test Result",
            "id": "zl5APgkT2qk"
        },
        {
            "name": "MNCH Infant HIV test",
            "id": "oXR37f2wOb1"
        },
        {
            "name": "MNCH Infant HIV Test Type",
            "id": "OGmE3wUMEzu"
        }
    ],
    "legendSets": [
        {
            "name": "UG HIV PLP - Quarterly Kit Distribution by Facility",
            "id": "govfcMUUYgw"
        },
        {
            "name": "UG HIV PLP SK Stock Difference",
            "id": "it8521AtHkq"
        },
        {
            "name": "UG HIV PLP - Starter Kit Distribution by clinic by month",
            "id": "zEMRDsqmCnZ"
        }
    ],
    "options": [
        {
            "code": "B200",
            "name": "B200 HIV disease resulting in mycobacterial infection",
            "id": "Q0Was11lCFZ"
        },
        {
            "code": "B201",
            "name": "B201 HIV disease resulting in other bacterial infections",
            "id": "sUwEgsiqIMV"
        }
    ],
    "dataSets": [
        {
            "code": "HIV_CARE",
            "name": "HIV Care Monthly",
            "id": "vc6nF5yZsPR"
        },
        {
            "code": "DS_377538",
            "name": "HIV Peadiatric monthly summary",
            "id": "EDzMBk0RRji"
        },
        {
            "code": "DS_HTC_SURVEY",
            "name": "HIV Testing Survey Form",
            "id": "lMnO5pQrS6t"
        },
        {
            "code": "DS_387142",
            "name": "TB/HIV (VCCT) monthly summary",
            "id": "OsPTWNqq26W"
        }
    ],
    "categoryCombos": [
        {
            "name": "HIV age",
            "id": "Wfan7UwK8CQ"
        },
        {
            "name": "HIV age+gender",
            "id": "jCNGsC2NawV"
        },
        {
            "name": "HIV Paed age+gender",
            "id": "v1K6CE6bmtw"
        }
    ],
    "dataElements": [
        {
            "code": "DE_374570",
            "name": "Children from Gen.Paed. ward tested for HIV",
            "id": "hhevl49MXyA"
        },
        {
            "code": "DE_374571",
            "name": "Children from Gen.Paed. ward with positive HIV result",
            "id": "HL77Pems4Cv"
        }
    ],
    "userGroups": [
        {
            "name": "HIV Program Coordinators",
            "id": "Rg8wusV7QYi"
        }
    ],
    "sections": [
        {
            "name": "HIV testing and counseling",
            "id": "ivQyNn9noBq"
        }
    ],
    "visualizations": [
        {
            "name": "HIV: 2. Care data quarterly at facility",
            "id": "OORSVsdfLeb"
        },
        {
            "name": "HIV: 3. Care data at district",
            "id": "bGFqKTadV4a"
        }
    ]
};

// Function to generate markdown table for a metadata type
function generateTable(typeName, items) {
    if (!items || items.length === 0) {
        return `### ${typeName}\n\nNo items found.\n\n`;
    }

    // Check if items have 'code' field
    const hasCode = items.some(item => item.code);

    let table = `### ${typeName}\n\n`;
    table += '| Name | Code |\n';
    table += '|---|---|\n';

    items.forEach(item => {
        const name = item.name || '';
        const code = item.code || '';
        table += `| ${name} | ${code} |\n`;
    });

    table += '\n';
    return table;
}

// Generate tables for all metadata types
let output = '';

Object.keys(metadata).forEach(type => {
    output += generateTable(type, metadata[type]);
});

console.log(output);
