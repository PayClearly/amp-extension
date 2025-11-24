const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/index.ts',
      content: './src/content/index.ts',
      popup: './src/popup/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name]/[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@background': path.resolve(__dirname, 'src/background'),
        '@content': path.resolve(__dirname, 'src/content'),
        '@popup': path.resolve(__dirname, 'src/popup'),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/popup/index.html',
        filename: 'popup/index.html',
        chunks: ['popup'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'icons', to: 'icons', noErrorOnMissing: true },
        ],
      }),
      new webpack.DefinePlugin({
        'process.env.USE_TEST_DATA': JSON.stringify(process.env.USE_TEST_DATA || 'false'),
        'process.env.NODE_ENV': JSON.stringify(argv.mode || 'development'),
        'process.env.AUTH_SERVICE_URL': JSON.stringify(process.env.AUTH_SERVICE_URL || ''),
        'process.env.QUEUE_SERVICE_URL': JSON.stringify(process.env.QUEUE_SERVICE_URL || ''),
        'process.env.PAYMENT_SERVICE_URL': JSON.stringify(process.env.PAYMENT_SERVICE_URL || ''),
        'process.env.PORTAL_LEARNING_SERVICE_URL': JSON.stringify(process.env.PORTAL_LEARNING_SERVICE_URL || ''),
        'process.env.EXCEPTION_SERVICE_URL': JSON.stringify(process.env.EXCEPTION_SERVICE_URL || ''),
        'process.env.EVIDENCE_SERVICE_URL': JSON.stringify(process.env.EVIDENCE_SERVICE_URL || ''),
        'process.env.TELEMETRY_SERVICE_URL': JSON.stringify(process.env.TELEMETRY_SERVICE_URL || ''),
        'process.env.GCP_PROJECT_ID': JSON.stringify(process.env.GCP_PROJECT_ID || ''),
        'process.env.BIGQUERY_DATASET': JSON.stringify(process.env.BIGQUERY_DATASET || ''),
        'process.env.BIGQUERY_TABLE': JSON.stringify(process.env.BIGQUERY_TABLE || ''),
        'process.env.GCS_EVIDENCE_BUCKET': JSON.stringify(process.env.GCS_EVIDENCE_BUCKET || ''),
        'process.env.OAUTH_CLIENT_ID': JSON.stringify(process.env.OAUTH_CLIENT_ID || ''),
        'process.env.TEMPLATE_SIGNING_PUBLIC_KEY': JSON.stringify(process.env.TEMPLATE_SIGNING_PUBLIC_KEY || ''),
        'process.env.TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT': JSON.stringify(process.env.TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT || '0.7'),
      }),
    ],
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    optimization: {
      minimize: isProduction,
    },
  };
};

