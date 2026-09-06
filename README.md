# ImageLab

ImageLab is a single-page application for generating image variants. It is a demonstration of Asynchronous APIs and the Event-Emitter pattern. The application consists of three main parts: an API server written in Go (`/cmd/api`), a web application using HTML, CSS and JavaScript (`/frontend`), and a PostgreSQL database (`/migrations`).

## CMPS4191 Test 1

| Key                | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Student Names**  | [Andres Hung](https://github.com/andreshungbz) & [Jennessa Sierra](https://github.com/jennxsierra) |
| **Student Emails** | 2018118240@ub.edu.bz & 2021153908@ub.edu.bz                                                        |
| **Course**         | CMPS4191 - Advanced Web Technologies                                                               |
| **School**         | University of Belize                                                                               |
| **Due Date**       | September 30, 2026                                                                                 |

## Running the Project

> [!NOTE]
> Example environment variables are used throughout this section for demonstration purposes. In a production environment, they should be changed.

### Docker Compose

If you have Docker installed, the provided `compose.yaml` sets up the database and migrations, the API server, and the web application. Run the following command while in the project root directory, then access the URLs with the default ports.

```
docker compose up
```

| Service             | URL                   |
| ------------------- | --------------------- |
| **API Server**      | http://localhost:4000 |
| **Web Application** | http://localhost:5500 |

### Manual Setup Procedure

#### Prerequisites

- go
- golang-migrate
- make
- PostgreSQL

#### Database Setup

Logging into your own PostgreSQL database instance as a user with sufficient permissions, run the following commands to create the necessary database and user.

```
CREATE ROLE imagelab WITH LOGIN PASSWORD 'password';
CREATE DATABASE imagelab;
ALTER DATABASE imagelab OWNER TO imagelab;
```

#### API Server Setup

In the project root directory, set up the environment variables and run the database migrations. By default, the API server will be available at http://localhost:4000.

```
cp .envrc.example .envrc
make db/migrations/up
make run
```

#### Web Application Setup

> [!NOTE]
> Using another host other than `localhost` or a different port other than `5500` requires appriately setting the `CORS_TRUSTED_ORIGINS` environment variable so that the API server does not block requests from the web application.

Use any HTTP server application such as [nginx](https://nginx.org/en/), [Apache](https://httpd.apache.org/), or [Caddy](https://caddyserver.com/) to serve the static web application files in the `/frontend` directory. The [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension for VS Code can also be used, but ensure the workspace is the `/frontend` directory and not the repository root. Then, the web application will be available at http://localhost:5500.

## Attributions

- Favicon framed picture icon is copyright 2020 Twitter, Inc., and other contributors. The graphics are licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). No modifications were made to the original image.
