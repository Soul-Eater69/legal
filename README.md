# Legal Document Assistant

A production-ready web application that intelligently fills legal document placeholders through an intuitive conversational interface.

## Features

- **Smart Document Parsing**: Automatically detects placeholders in legal documents (supports `[PLACEHOLDER_NAME]` and `[____]` formats)
- **AI-Powered Conversation**: Guides users through filling in document fields with intelligent validation
- **Session Management**: Secure session handling with automatic cleanup after 24 hours
- **Production-Ready**: Built with Next.js 16, TypeScript, and Tailwind CSS
- **Real-time Progress Tracking**: Visual progress indicators and field completion status
- **Document Download**: Generate and download completed documents in DOCX format
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark Mode UI**: Modern, professional interface with dark theme

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Document Processing**:
  - `mammoth` - Extract text from DOCX files
  - `docxtemplater` - Fill document templates
  - `pizzip` - Handle DOCX file structure
- **UI Components**: Custom components with Radix UI primitives
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd legal
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
npm start
```

## How It Works

### 1. Document Upload
- Users upload a `.docx` file containing placeholders
- The system extracts text and identifies all placeholders
- A unique session is created with a 24-hour lifetime

### 2. Conversational Interface
- The assistant guides users through each field
- Smart value extraction from natural language responses
- Real-time validation for:
  - Numbers (investment amounts, valuations)
  - Dates (MM/DD/YYYY format)
  - State codes (2-letter US state abbreviations)
  - Text fields (names, company names, etc.)

### 3. Document Generation
- Once all fields are filled, users can download the completed document
- Original formatting is preserved using `docxtemplater`
- Generated filename includes original name and timestamp

## Placeholder Formats

The system recognizes two types of placeholders:

1. **Named Placeholders**: `[COMPANY_NAME]`, `[INVESTOR_NAME]`, `[DATE]`
2. **Blank Fields**: `[____]` (inferred from surrounding context)

### Supported Placeholder Types

- **Text**: Company names, investor names, general text
- **Numbers**: Investment amounts, valuations, prices
- **Dates**: Contract dates, deadlines
- **Email**: Email addresses
- **States**: US state codes

## Project Structure

```
legal/
├── app/
│   ├── api/
│   │   ├── upload/       # Document upload and parsing
│   │   ├── chat/         # Conversation handling
│   │   └── generate/     # Document generation
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Main application UI
│   └── globals.css       # Global styles
├── lib/
│   ├── session-manager.ts      # Session state management
│   ├── document-processor.ts   # DOCX parsing and placeholder detection
│   ├── docx-generator.ts       # Document generation
│   ├── ai-client.ts            # Conversation processing
│   ├── types.ts                # TypeScript types
│   └── utils.ts                # Utility functions
├── components/
│   └── ui/               # Reusable UI components
├── uploads/              # Temporary file storage (gitignored)
└── sessions/             # Session data (gitignored)
```

## API Endpoints

### POST /api/upload
Upload a document and create a new session.

**Request**: FormData with `file` field
**Response**:
```json
{
  "sessionId": "string",
  "placeholders": [...],
  "documentPreview": "string",
  "fileName": "string"
}
```

### POST /api/chat
Process user messages and update placeholders.

**Request**:
```json
{
  "sessionId": "string",
  "message": "string",
  "placeholders": [...]
}
```

**Response**:
```json
{
  "message": "string",
  "updatedPlaceholders": [...],
  "isComplete": boolean
}
```

### POST /api/generate
Generate the completed document.

**Request**:
```json
{
  "sessionId": "string"
}
```

**Response**: DOCX file (binary)

## Session Management

- Sessions are stored in-memory with disk persistence
- Automatic cleanup after 24 hours of inactivity
- Session files stored in `sessions/` directory
- Uploaded documents stored in `uploads/` directory with session prefix

## Error Handling

- Comprehensive error messages for invalid inputs
- Session expiration handling
- File validation (DOCX only)
- Placeholder validation with helpful feedback
- Network error handling with retry logic

## Security Considerations

- File type validation (DOCX only)
- Session-based isolation
- Automatic session cleanup
- Input validation and sanitization
- Error messages don't expose internal details

## Future Enhancements

- [ ] Support for more document formats (PDF, ODT)
- [ ] Advanced placeholder types (dates with format options, currency)
- [ ] Document templates library
- [ ] Multi-language support
- [ ] Cloud storage integration
- [ ] User authentication
- [ ] Document history and versioning
- [ ] Collaborative editing

## License

This project is private and proprietary.

## Support

For issues or questions, please contact the development team.
