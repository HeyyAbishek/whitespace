# Local Development Setup

### Prerequisites

- Node.js 22+** (Recommended for Next.js 16)
- npm

### Installation

1.  **Clone the repository**

    ```bash
    git clone [https://github.com/HeyyAbishek/whitespace.git](https://github.com/HeyyAbishek/whitespace.git)
    cd whitespace
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Environment Variables**
    Create a `.env.local` file in the root:

    ```bash
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...
    LIVEBLOCKS_SECRET_KEY=sk_prod_...
    ```

4.  **Run the server**
    ```bash
    npm run dev
    ```
