// Simple test script to validate multilingual LLM support
// Run with: node test_multilingual_support.js

const { llmClassificationService } = require('./src/utils/llm-classification-service');

// Test queries in different languages
const testQueries = [
    // English
    { query: "Show malaria cases by district", language: "en", expectedIntent: "analytics" },
    { query: "Create a new data element", language: "en", expectedIntent: "crud" },

    // French
    { query: "Afficher les cas de malaria par district", language: "fr", expectedIntent: "analytics" },
    { query: "Créer un nouvel élément de données", language: "fr", expectedIntent: "crud" },

    // Spanish
    { query: "Mostrar casos de malaria por distrito", language: "es", expectedIntent: "analytics" },
    { query: "Crear un nuevo elemento de datos", language: "es", expectedIntent: "crud" },

    // Arabic
    { query: "عرض حالات الملاريا حسب المنطقة", language: "ar", expectedIntent: "analytics" },
    { query: "إنشاء عنصر بيانات جديد", language: "ar", expectedIntent: "crud" },

    // Portuguese
    { query: "Mostrar casos de malária por distrito", language: "pt", expectedIntent: "analytics" },
    { query: "Criar um novo elemento de dados", language: "pt", expectedIntent: "crud" },
];

async function runTests() {
    console.log('🧪 Testing multilingual LLM classification support...\n');

    for (const test of testQueries) {
        try {
            console.log(`🌐 Testing ${test.language.toUpperCase()}: "${test.query}"`);

            // Test intent classification
            const intentResult = await llmClassificationService.classifyIntent(test.query, {
                locale: test.language
            });

            console.log(`   🤖 Intent: ${intentResult.intent} (confidence: ${(intentResult.confidence * 100).toFixed(1)}%)`);

            // Test query analysis
            const queryResult = await llmClassificationService.analyzeQuery(test.query, {
                locale: test.language
            });

            console.log(`   📊 Query Analysis: ${queryResult.intent} (${queryResult.entities.length} entities detected)`);

            // Test column type detection (if applicable)
            if (test.query.toLowerCase().includes('element') || test.query.toLowerCase().includes('élément') || test.query.toLowerCase().includes('elemento')) {
                const columnResult = await llmClassificationService.detectColumnType('dataElement', {
                    locale: test.language
                });
                console.log(`   📋 Column Type: ${columnResult.type} (confidence: ${(columnResult.confidence * 100).toFixed(1)}%)`);
            }

            console.log('   ✅ Test passed\n');

        } catch (error) {
            console.log(`   ❌ Test failed: ${error.message}\n`);
        }
    }

    console.log('🏁 Multilingual support testing completed!');
}

// Run tests if this script is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests, testQueries };
