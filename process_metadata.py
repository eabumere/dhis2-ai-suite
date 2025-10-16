#!/usr/bin/env python3
import json
import sys

# DHIS2 Metadata JSON (from the task)
metadata = {
    "categories": [
        {
            "code": "HIV_AGE",
            "name": "HIV age",
            "created": "2011-12-24T12:24:25.155",
            "lastUpdated": "2013-05-28T09:32:36.063",
            "id": "veGzholzPQm"
        },
        {
            "code": "HIV_PAED_AGE",
            "name": "HIV paediatric age",
            "created": "2011-12-24T12:24:25.155",
            "lastUpdated": "2013-05-28T09:32:22.962",
            "id": "aN4inMKVhqc"
        }
    ],
    "dataEntryForms": [
        {
            "name": "HIV Peadriatic Form",
            "created": "2015-12-13T11:48:00.000",
            "lastUpdated": "2015-12-13T11:48:00.000",
            "id": "tS6WlfUBgwg"
        }
    ],
    "indicators": [
        {
            "name": "HIV: testing and counseling 15-24y",
            "created": "2017-03-13T19:19:10.632",
            "lastUpdated": "2017-03-13T19:44:08.197",
            "id": "sMTMkudvLCD"
        },
        {
            "name": "HIV: testing and counseling <15y",
            "created": "2017-03-13T19:17:37.534",
            "lastUpdated": "2017-03-13T19:44:19.030",
            "id": "lI5Q5vkydYu"
        },
        {
            "name": "HIV: testing and counseling 25-49y",
            "created": "2017-03-13T19:21:19.367",
            "lastUpdated": "2017-03-13T19:44:27.764",
            "id": "lOiynlltFdy"
        },
        {
            "name": "HIV: testing and counseling >49y",
            "created": "2017-03-13T19:22:56.705",
            "lastUpdated": "2017-03-13T19:44:37.532",
            "id": "btgZ1oeF9pJ"
        }
    ],
    "indicatorGroups": [
        {
            "name": "HIV",
            "created": "2013-04-18T14:36:27.000",
            "lastUpdated": "2013-04-18T14:36:27.000",
            "id": "RsvclmONCT3"
        },
        {
            "name": "HIV Care Data Export",
            "created": "2017-03-13T19:24:31.214",
            "lastUpdated": "2017-03-13T19:26:26.939",
            "id": "uFcn6Gs8rTC"
        }
    ],
    "dataElementGroups": [
        {
            "name": "HIV/AIDS",
            "created": "2011-12-24T12:24:24.298",
            "lastUpdated": "2014-03-02T22:20:47.593",
            "id": "HKU7L73im5r"
        },
        {
            "name": "HIV Care",
            "created": "2017-03-12T20:52:26.882",
            "lastUpdated": "2017-03-12T20:52:26.882",
            "id": "URmi41e0SFH"
        },
        {
            "name": "HIV Peadriatics",
            "created": "2011-12-24T12:24:24.298",
            "lastUpdated": "2014-11-11T21:52:48.540",
            "id": "ID4BbhF7Eli"
        }
    ],
    "optionSets": [
        {
            "code": "OS_HIV_RESULT",
            "name": "HIV Test Result",
            "created": "2025-10-15T23:22:14.514",
            "lastUpdated": "2025-10-15T23:22:14.514",
            "id": "zl5APgkT2qk"
        },
        {
            "name": "MNCH Infant HIV test",
            "created": "2012-09-20T18:08:33.541",
            "lastUpdated": "2012-09-20T18:08:33.541",
            "id": "oXR37f2wOb1"
        },
        {
            "name": "MNCH Infant HIV Test Type",
            "created": "2012-08-07T10:27:28.791",
            "lastUpdated": "2012-08-07T10:27:28.791",
            "id": "OGmE3wUMEzu"
        }
    ],
    "legendSets": [
        {
            "name": "UG HIV PLP - Quarterly Kit Distribution by Facility",
            "created": "2013-09-25T09:19:01.051",
            "lastUpdated": "2016-10-05T18:39:43.177",
            "id": "govfcMUUYgw"
        },
        {
            "name": "UG HIV PLP SK Stock Difference",
            "created": "2013-11-30T07:57:14.665",
            "lastUpdated": "2016-10-05T18:50:54.353",
            "id": "it8521AtHkq"
        },
        {
            "name": "UG HIV PLP - Starter Kit Distribution by clinic by month",
            "created": "2013-09-24T13:30:44.670",
            "lastUpdated": "2016-10-05T18:49:06.773",
            "id": "zEMRDsqmCnZ"
        }
    ],
    "options": [
        {
            "code": "B200",
            "name": "B200 HIV disease resulting in mycobacterial infection",
            "created": "2014-08-18T12:39:16.000",
            "lastUpdated": "2014-08-18T12:39:16.000",
            "id": "Q0Was11lCFZ"
        },
        {
            "code": "B201",
            "name": "B201 HIV disease resulting in other bacterial infections",
            "created": "2014-08-18T12:39:16.000",
            "lastUpdated": "2014-08-18T12:39:16.000",
            "id": "sUwEgsiqIMV"
        }
    ],
    "dataSets": [
        {
            "code": "HIV_CARE",
            "name": "HIV Care Monthly",
            "created": "2017-03-12T20:30:53.575",
            "lastUpdated": "2017-03-12T20:36:03.542",
            "id": "vc6nF5yZsPR"
        },
        {
            "code": "DS_377538",
            "name": "HIV Peadiatric monthly summary",
            "created": "2012-06-09T21:17:01.656",
            "lastUpdated": "2014-11-11T21:52:48.505",
            "id": "EDzMBk0RRji"
        },
        {
            "code": "DS_HTC_SURVEY",
            "name": "HIV Testing Survey Form",
            "created": "2025-10-15T23:22:14.574",
            "lastUpdated": "2025-10-16T00:03:51.624",
            "id": "lMnO5pQrS6t"
        },
        {
            "code": "DS_387142",
            "name": "TB/HIV (VCCT) monthly summary",
            "created": "2011-12-24T12:24:22.881",
            "lastUpdated": "2013-04-09T21:41:39.734",
            "id": "OsPTWNqq26W"
        }
    ],
    "categoryCombos": [
        {
            "name": "HIV age",
            "created": "2011-12-24T12:24:25.203",
            "lastUpdated": "2011-12-24T12:24:25.203",
            "id": "Wfan7UwK8CQ"
        },
        {
            "name": "HIV age+gender",
            "created": "2011-12-24T12:24:25.203",
            "lastUpdated": "2011-12-24T12:24:25.203",
            "id": "jCNGsC2NawV"
        },
        {
            "name": "HIV Paed age+gender",
            "created": "2011-12-24T12:24:25.203",
            "lastUpdated": "2011-12-24T12:24:25.203",
            "id": "v1K6CE6bmtw"
        }
    ],
    "dataElements": [
        {
            "code": "DE_374570",
            "name": "Children from Gen.Paed. ward tested for HIV",
            "created": "2010-02-05T10:58:16.145",
            "lastUpdated": "2014-11-11T21:56:05.738",
            "id": "hhevl49MXyA"
        },
        {
            "code": "DE_374571",
            "name": "Children from Gen.Paed. ward with positive HIV result",
            "created": "2010-02-05T10:58:15.973",
            "lastUpdated": "2014-11-11T21:56:05.657",
            "id": "HL77Pems4Cv"
        }
    ],
    "userGroups": [
        {
            "name": "HIV Program Coordinators",
            "created": "2013-03-11T18:25:44.229",
            "lastUpdated": "2019-04-29T16:12:52.354",
            "id": "Rg8wusV7QYi"
        }
    ],
    "sections": [
        {
            "name": "HIV testing and counseling",
            "created": "2017-03-12T20:32:02.165",
            "lastUpdated": "2017-03-12T20:32:02.165",
            "id": "ivQyNn9noBq"
        }
    ],
    "visualizations": [
        {
            "name": "HIV: 2. Care data quarterly at facility",
            "created": "2017-03-14T18:37:24.138",
            "lastUpdated": "2017-03-14T18:39:16.086",
            "id": "OORSVsdfLeb"
        },
        {
            "name": "HIV: 3. Care data at district",
            "created": "2017-03-14T18:41:15.894",
            "lastUpdated": "2017-03-14T18:41:15.894",
            "id": "bGFqKTadV4a"
        }
    ]
}

def generate_table(type_name, items):
    """Generate markdown table for a metadata type"""
    if not items:
        return f"### {type_name}\n\nNo items found.\n\n"

    # Check if items have 'code' field
    has_code = any('code' in item for item in items)

    table = f"### {type_name}\n\n"
    table += "| Name | Code |\n"
    table += "|------|------|\n"

    for item in items:
        name = item.get('name', '')
        code = item.get('code', '')
        table += f"| {name} | {code} |\n"

    table += "\n"
    return table

# Generate tables for all metadata types
output = ""
for metadata_type in metadata:
    output += generate_table(metadata_type, metadata[metadata_type])

print(output)
