import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['out/**', 'dist/**', 'release/**', 'coverage/**', 'node_modules/**']
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        extends: [js.configs.recommended],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser
            }
        }
    },
    ...tseslint.configs.recommended,
    {
        files: ['src/renderer/src/**/*.{ts,tsx}'],
        plugins: {
            react,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh
        },
        settings: {
            react: {
                version: 'detect'
            }
        },
        languageOptions: {
            globals: globals.browser
        },
        rules: {
            ...react.configs.flat.recommended.rules,
            ...reactHooks.configs.flat.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
        }
    }
)
