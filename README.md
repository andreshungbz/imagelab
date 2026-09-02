# ImageLab

## CMPS4191 Advanced Web Technologies - Test 1

| Key               | Value                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Student Name**  | [Andres Hung](https://github.com/andreshungbz) & [Jennessa Sierra](https://github.com/jennxsierra) |
| **Student Email** | 2018118240@ub.edu.bz & 2021153908@ub.edu.bz                                                        |
| **Course**        | CMPS4191 - Advanced Web Technologies                                                               |
| **Due Date**      | September 30, 2026                                                                                 |

## Running the Application

### Docker Compose

```
docker compose up
```

### Manual Method

#### Prerequisites

- curl
- go
- golang-migrate
- make
- PostgreSQL

#### Database Setup

```
CREATE ROLE imagelab WITH LOGIN PASSWORD 'password';
CREATE DATABASE imagelab;
ALTER DATABASE imagelab OWNER TO imagelab;
```

#### Application Setup

```
cp .envrc.example .envrc
make db/migrations/up
make run
```
