import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';


// Function to customize the filename of uploaded files
export const editFileName = (req, file, callback) => {
    const fileExtName = extname(file.originalname);
    const randomName = uuidv4();
    callback(null, `${randomName}${fileExtName}`);
};
