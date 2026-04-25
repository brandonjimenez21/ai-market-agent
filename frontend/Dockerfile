FROM node:20-alpine

# We set the working directory within the container
WORKDIR /app

# We copy the dependency files first (to take advantage of Docker's cache)
COPY package.json package-lock.json ./

# # We installed the facilities
RUN npm install

# We copy the rest of the frontend code
COPY . .

# We expose port 3000
EXPOSE 3000

# Command to start Next.js in development mode
CMD ["npm", "run", "dev"]