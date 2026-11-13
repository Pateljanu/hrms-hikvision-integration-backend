const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: {
        main: './server.js',  // Entry point: your main server file
    },
    output: {
        path: path.join(__dirname, 'dev-build'),  // Output directory
        filename: '[name].js',                     // Output: main.js
        clean: true,                               // Clean before each build
    },
    mode: 'development',    // Development mode (not minified)
    target: 'node',         // Target Node.js environment
    externals: [nodeExternals()],  // Exclude node_modules
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',  // Use Babel to transpile
                },
            },
        ],
    },
    resolve: {
        extensions: ['.js'],
    },
};
