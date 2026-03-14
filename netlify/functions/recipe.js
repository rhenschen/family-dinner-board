const axios = require('axios');

exports.handler = async (event, context) => {
    const { recipeName } = JSON.parse(event.body);
    const apiKey = 'YOUR_CLAUDE_API_KEY'; // Replace with your Claude API key

    try {
        const response = await axios.post('https://api.claude.ai/v1/extract', {
            input: `Get the ingredients for the ${recipeName} recipe.`
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const ingredients = response.data.ingredients;

        return {
            statusCode: 200,
            body: JSON.stringify({ ingredients }), 
        };
    } catch (error) {
        return {
            statusCode: error.response ? error.response.status : 500,
            body: JSON.stringify({ message: error.message }),
        };
    }
};